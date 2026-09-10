/**
 * 과목 게시판 데이터 접근.
 *
 * 다섯 게시판(자기소개·팀빌딩 모집·기업 제안·확정 팀·결과물)과 공용 댓글이 여기를 지납니다.
 * 화면은 Supabase 이름을 모르고, 이 파일이 도메인 타입으로 바꿔서 넘깁니다.
 *
 * 접근 통제의 실제 경계는 RLS입니다(014-capstone-course.sql). 여기서 하는 검사는
 * 저장 버튼을 누르기 전에 사용자에게 이유를 알려 주기 위한 것이지 보안 경계가 아닙니다.
 */

import { supabase } from "../supabase";
import { requireClient, getAuthHeaders, getProfileNames } from "./WorkspaceService";
import { requireAuthUserId, getAuthUserId } from "./sessionCache";
import {
  COURSE,
  COURSE_CALLBACK_HREF,
  checkAttachment,
  parseRecruitRoles,
  parseStringArray,
  parseTeamMembers,
  semesterColumns,
  toStoragePath,
  type BoardGuide,
  type BoardId,
  type CourseFile,
  type CourseComment,
  type CourseNotice,
  type CourseQuestion,
  type CourseTeam,
  type Deliverable,
  type DeliverablePhase,
  type ProjectPhase,
  type Proposal,
  type RecruitPost,
  type RecruitRole,
  type RecruitStatus,
  type SemesterProfile,
  type StudentStatus,
  type TeamMember,
  type TeamStatus,
} from "@/features/course/course";

/** 이름이 없는 계정. 이름 때문에 목록이 통째로 비면 손해가 더 큽니다. */
const UNKNOWN_AUTHOR = "이름 미등록";

/**
 * 게시판별 댓글 수.
 *
 * PostgREST에는 group by가 없어 대상 id만 받아 와 세어 둡니다. 한 학기 댓글은
 * 많아야 수천 건이라 목록마다 카운트 조회를 거는 것보다 왕복이 적습니다.
 */
async function getCommentCounts(board: BoardId): Promise<Map<string, number>> {
  const { data } = await requireClient().from("course_comments").select("target_id").eq("board", board);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.target_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------- 게시판 안내

const GUIDE_COLUMNS = "id, board, title, content, updated_at";

/**
 * 게시판 안내 한 장.
 *
 * 없으면 null이고, 그때 화면은 아무것도 그리지 않습니다(운영진에게만 "안내 작성"이 보입니다).
 * 첨부까지 함께 읽어 옵니다 — 안내는 목록 맨 위 한 덩어리라 나눠 부를 이유가 없습니다.
 */
export async function getBoardGuide(board: BoardId): Promise<BoardGuide | null> {
  const { data, error } = await requireClient()
    .from("course_board_guides")
    .select(GUIDE_COLUMNS)
    .eq("semester_key", COURSE.key)
    .eq("board", board)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as RecruitRow;
  const files = await getCourseFiles({ kind: "guide", id: row.id as string }).catch(() => [] as CourseFile[]);
  return {
    id: row.id as string,
    board: row.board as BoardId,
    title: (row.title as string) ?? "",
    content: row.content as string,
    updatedAt: row.updated_at as string,
    files,
  };
}

/** 등록과 수정이 같은 경로입니다. `UNIQUE (semester_key, board)`라 두 번째 저장은 갱신입니다. */
export async function saveBoardGuide(board: BoardId, input: { title: string; content: string }): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("course_board_guides")
    .upsert(
      {
        semester_key: COURSE.key,
        board,
        title: input.title.trim(),
        content: input.content.trim(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "semester_key,board" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteBoardGuide(id: string) {
  const { error } = await requireClient().from("course_board_guides").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- 수업게시판(공지)

const NOTICE_COLUMNS = "id, title, content, is_pinned, created_by, created_at, updated_at";

const toNotice = (row: RecruitRow, names: Map<string, string>, counts: Map<string, number>): CourseNotice => ({
  id: row.id as string,
  title: row.title as string,
  content: row.content as string,
  isPinned: row.is_pinned === true,
  createdBy: row.created_by as string,
  authorName: names.get(row.created_by as string) ?? "운영진",
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
  commentCount: counts.get(row.id as string) ?? 0,
});

export async function getNotices(): Promise<CourseNotice[]> {
  const { data, error } = await requireClient()
    .from("course_notices")
    .select(NOTICE_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RecruitRow[];
  const [names, counts] = await Promise.all([
    getProfileNames(rows.map((row) => row.created_by as string)),
    getCommentCounts("notice"),
  ]);
  return rows.map((row) => toNotice(row, names, counts));
}

export async function getNotice(id: string): Promise<CourseNotice | null> {
  const { data, error } = await requireClient().from("course_notices").select(NOTICE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecruitRow;
  const [names, counts] = await Promise.all([
    getProfileNames([row.created_by as string]),
    getCommentCounts("notice"),
  ]);
  return toNotice(row, names, counts);
}

export async function createNotice(input: { title: string; content: string; isPinned: boolean }): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("course_notices")
    .insert({
      ...semesterColumns(),
      created_by: userId,
      title: input.title.trim(),
      content: input.content.trim(),
      is_pinned: input.isPinned,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateNotice(id: string, input: { title: string; content: string; isPinned: boolean }) {
  const { error } = await requireClient()
    .from("course_notices")
    .update({
      title: input.title.trim(),
      content: input.content.trim(),
      is_pinned: input.isPinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setNoticePinned(id: string, isPinned: boolean) {
  const { error } = await requireClient()
    .from("course_notices")
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteNotice(id: string) {
  const { error } = await requireClient().from("course_notices").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 이 계정이 과목 운영진인가(공지 작성 권한).
 *
 * `isCourseMember()`와 같은 이유로 DB 함수(019의 `is_course_staff()`)에게 그대로 묻습니다.
 * 화면에서 메일 주소를 다시 대조하면 명단이 바뀔 때 두 곳이 어긋납니다.
 */
/**
 * 운영진의 사용자 id 집합.
 *
 * `isCourseStaff()`는 "나는 운영진인가"만 답합니다. 글·댓글에 [교수자] 뱃지를 붙이려면
 * 남에 대한 판정이 필요해 목록을 따로 받습니다(022의 `course_staff_ids()` — id만 돌려주고
 * 메일 주소는 주지 않습니다).
 *
 * 실패하면 빈 집합입니다. 뱃지는 장식이라, 못 읽었다고 목록이 비면 손해가 더 큽니다.
 */
export async function getStaffIds(): Promise<Set<string>> {
  const { data, error } = await requireClient().rpc("course_staff_ids");
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: { user_id: string }) => row.user_id));
}

export async function isCourseStaff(): Promise<boolean> {
  const userId = await getAuthUserId();
  if (!userId) return false;
  const { data, error } = await requireClient().rpc("is_course_staff");
  if (error) return false;
  return data === true;
}

export interface ViewerStatus {
  member: boolean;
  staff: boolean;
  banned: boolean;
}

/**
 * 자격·권한·차단을 한 번에 읽습니다(025).
 *
 * 셋을 따로 물으면 왕복이 셋이고, 그 사이 화면이 세 번 바뀝니다. 차단이 생기면서
 * "인증은 했지만 쓸 수 없음"이라는 경우가 늘어 화면이 셋을 구분해야 합니다.
 *
 * 실패하면 전부 false입니다 — 못 물었을 때 열어 주면, 025를 적용하지 않은 환경에서
 * 버튼이 열렸다가 저장에서 떨어집니다.
 */
export async function getViewerStatus(): Promise<ViewerStatus> {
  const userId = await getAuthUserId();
  if (!userId) return { member: false, staff: false, banned: false };
  const { data, error } = await requireClient().rpc("course_viewer_status");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { member: false, staff: false, banned: false };
  return { member: row.member === true, staff: row.staff === true, banned: row.banned === true };
}

// ---------------------------------------------------------------- 수강생 명단(운영진)

export interface CourseMember {
  userId: string;
  email: string;
  fullName: string;
  major: string;
  status: string;
  joinedAt: string;
  hasProfile: boolean;
  isStaff: boolean;
  isBanned: boolean;
  banReason: string;
}

/**
 * 전체 수강생. 운영진만 부를 수 있고, 아니면 DB 함수가 FORBIDDEN으로 끊습니다.
 * 자기소개를 안 쓴 학생도 나옵니다 — 그래야 명단이 실제 수강 인원과 맞는지 보입니다.
 */
export async function getCourseMembers(): Promise<CourseMember[]> {
  const { data, error } = await requireClient().rpc("course_members", { target_semester: COURSE.key });
  if (error) throw error;
  return ((data ?? []) as RecruitRow[]).map((row) => ({
    userId: row.user_id as string,
    email: (row.email as string) ?? "",
    fullName: (row.full_name as string) ?? "",
    major: (row.major as string) ?? "",
    status: (row.status as string) ?? "",
    joinedAt: row.joined_at as string,
    hasProfile: row.has_profile === true,
    isStaff: row.is_staff === true,
    isBanned: row.is_banned === true,
    banReason: (row.ban_reason as string) ?? "",
  }));
}

/** 쓰기를 막습니다. 남긴 글은 그대로 두고, 해제는 행 하나를 지우면 됩니다. */
export async function banMember(userId: string, reason: string) {
  const staffId = await requireAuthUserId();
  const { error } = await requireClient()
    .from("course_bans")
    .insert({ user_id: userId, semester_key: COURSE.key, reason: reason.trim(), banned_by: staffId });
  if (error) throw error;
}

export async function unbanMember(userId: string) {
  const { error } = await requireClient().from("course_bans").delete().eq("user_id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------- 팀빌딩 모집

const RECRUIT_COLUMNS = "id, author_id, title, content, tags, project_phase, recruiting_roles, status, created_at";

type RecruitRow = Record<string, unknown>;

const toRecruitPost = (row: RecruitRow, names: Map<string, string>, counts: Map<string, number>): RecruitPost => {
  const authorId = (row.author_id as string | null) ?? null;
  return {
    id: row.id as string,
    authorId,
    authorName: (authorId && names.get(authorId)) || UNKNOWN_AUTHOR,
    title: row.title as string,
    content: row.content as string,
    tags: parseStringArray(row.tags),
    projectPhase: ((row.project_phase as string) || "IDEA") as ProjectPhase,
    recruitingRoles: parseRecruitRoles(row.recruiting_roles),
    status: ((row.status as string) === "Closed" ? "Closed" : "Recruiting") as RecruitStatus,
    createdAt: row.created_at as string,
    commentCount: counts.get(row.id as string) ?? 0,
  };
};

export async function getRecruitPosts(): Promise<RecruitPost[]> {
  const { data, error } = await requireClient()
    .from("recruitment_posts")
    .select(RECRUIT_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RecruitRow[];
  const [names, counts] = await Promise.all([
    getProfileNames(rows.map((row) => row.author_id as string)),
    getCommentCounts("recruit"),
  ]);
  return rows.map((row) => toRecruitPost(row, names, counts));
}

export async function getRecruitPost(id: string): Promise<RecruitPost | null> {
  const { data, error } = await requireClient().from("recruitment_posts").select(RECRUIT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecruitRow;
  const [names, counts] = await Promise.all([
    getProfileNames([row.author_id as string]),
    getCommentCounts("recruit"),
  ]);
  return toRecruitPost(row, names, counts);
}

export interface RecruitPostInput {
  title: string;
  content: string;
  tags: string[];
  projectPhase: ProjectPhase;
  recruitingRoles: RecruitRole[];
}

export async function createRecruitPost(input: RecruitPostInput): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("recruitment_posts")
    .insert({
      ...semesterColumns(),
      author_id: userId,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags,
      project_phase: input.projectPhase,
      recruiting_roles: input.recruitingRoles,
      status: "Recruiting",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateRecruitPost(id: string, input: RecruitPostInput) {
  const { error } = await requireClient()
    .from("recruitment_posts")
    .update({
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags,
      project_phase: input.projectPhase,
      recruiting_roles: input.recruitingRoles,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** 모집 마감·재개. 글을 지우는 대신 상태만 바꿔 지원자가 지난 글도 볼 수 있게 둡니다. */
export async function setRecruitStatus(id: string, status: RecruitStatus) {
  const { error } = await requireClient()
    .from("recruitment_posts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRecruitPost(id: string) {
  const { error } = await requireClient().from("recruitment_posts").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- 기업 제안

const PROPOSAL_COLUMNS = "id, created_by, company_name, title, content, category, deadline, contact, created_at";

const toProposal = (row: RecruitRow, counts: Map<string, number>): Proposal => ({
  id: row.id as string,
  createdBy: (row.created_by as string | null) ?? null,
  companyName: row.company_name as string,
  title: row.title as string,
  content: row.content as string,
  categories: parseStringArray(row.category),
  deadline: (row.deadline as string | null) ?? null,
  contact: (row.contact as string | null) ?? "",
  createdAt: row.created_at as string,
  commentCount: counts.get(row.id as string) ?? 0,
});

export async function getProposals(): Promise<Proposal[]> {
  const { data, error } = await requireClient()
    .from("corporate_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const counts = await getCommentCounts("proposal");
  return ((data ?? []) as RecruitRow[]).map((row) => toProposal(row, counts));
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const { data, error } = await requireClient().from("corporate_proposals").select(PROPOSAL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toProposal(data as RecruitRow, await getCommentCounts("proposal"));
}

export interface ProposalInput {
  companyName: string;
  title: string;
  content: string;
  categories: string[];
  deadline: string | null;
  contact: string | null;
}

export async function createProposal(input: ProposalInput): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("corporate_proposals")
    .insert({
      ...semesterColumns(),
      created_by: userId,
      company_name: input.companyName.trim(),
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.categories,
      deadline: input.deadline,
      contact: input.contact,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------- 기업 제안 첨부

const COURSE_BUCKET = "course";

/**
 * 첨부 올리기.
 *
 * 순서가 중요합니다 — 스토리지에 먼저 올리고, 성공한 것만 목록(proposal_files)에 적습니다.
 * 반대로 하면 목록에는 있는데 파일이 없는 행이 남아 화면에 깨진 링크가 생깁니다.
 * 반대 방향(파일은 올라갔는데 행이 없음)은 눈에 보이지 않으므로 덜 나쁩니다.
 */
/** 첨부가 붙는 곳. 021에서 표 하나(course_files)가 둘을 함께 담습니다. */
type FileOwner = { kind: "proposal"; id: string } | { kind: "guide"; id: string } | { kind: "deliverable"; id: string };

const ownerColumn = (owner: FileOwner) => `${owner.kind}_id`;

export async function uploadCourseFile(owner: FileOwner, file: File): Promise<CourseFile> {
  const problem = checkAttachment(file);
  if (problem) throw new Error(problem);

  const client = requireClient();
  const userId = await requireAuthUserId();
  const path = toStoragePath(`${owner.kind}s`, owner.id, file.name, crypto.randomUUID());

  const { error: uploadError } = await client.storage
    .from(COURSE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from("course_files")
    .insert({
      [ownerColumn(owner)]: owner.id,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: userId,
    })
    .select("id, file_name, storage_path, mime_type, size_bytes, created_by")
    .single();
  if (error) {
    // 목록에 못 적었으면 올린 파일도 치웁니다. 주인 없는 파일이 버킷에 쌓이지 않도록.
    await client.storage.from(COURSE_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return toCourseFile(data as RecruitRow);
}

const toCourseFile = (row: RecruitRow): CourseFile => ({
  id: row.id as string,
  fileName: row.file_name as string,
  storagePath: row.storage_path as string,
  mimeType: (row.mime_type as string | null) ?? null,
  sizeBytes: Number(row.size_bytes ?? 0),
  createdBy: row.created_by as string,
});

export async function getCourseFiles(owner: FileOwner): Promise<CourseFile[]> {
  const { data, error } = await requireClient()
    .from("course_files")
    .select("id, file_name, storage_path, mime_type, size_bytes, created_by")
    .eq(ownerColumn(owner), owner.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RecruitRow[]).map(toCourseFile);
}

/** 기존 호출부가 쓰던 이름. 제안 첨부는 여전히 가장 흔한 경우라 짧은 길을 남겨 둡니다. */
export const getProposalFiles = (proposalId: string) => getCourseFiles({ kind: "proposal", id: proposalId });
export const getDeliverableFiles = (deliverableId: string) => getCourseFiles({ kind: "deliverable", id: deliverableId });
export const uploadProposalFile = (proposalId: string, file: File) =>
  uploadCourseFile({ kind: "proposal", id: proposalId }, file);

/**
 * 내려받을 주소.
 *
 * 공개 버킷이라 서명이 필요 없습니다 — 로그인하지 않은 학생도 게시판을 읽을 수 있어야
 * 하는데, 서명 링크는 세션이 있어야 만들 수 있습니다(게시판이 공개인 이유와 같습니다).
 */
export function getProposalFileUrl(storagePath: string): string {
  const client = requireClient();
  return client.storage.from(COURSE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function deleteProposalFile(file: CourseFile) {
  const client = requireClient();
  const { error } = await client.from("course_files").delete().eq("id", file.id);
  if (error) throw error;
  // 행이 지워졌으면 파일도 치웁니다. 실패해도 화면에서는 이미 사라진 상태입니다.
  await client.storage.from(COURSE_BUCKET).remove([file.storagePath]).catch(() => undefined);
}

export async function updateProposal(id: string, input: ProposalInput) {
  const { error } = await requireClient()
    .from("corporate_proposals")
    .update({
      company_name: input.companyName.trim(),
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.categories,
      deadline: input.deadline,
      contact: input.contact,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProposal(id: string) {
  const { error } = await requireClient().from("corporate_proposals").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- 확정 팀

const TEAM_COLUMNS = "id, leader_id, team_name, project_item, members, status, team_no, confirmed_at, proposal_id, created_at";

const toTeam = (row: RecruitRow, names: Map<string, string>, counts: Map<string, number>): CourseTeam => {
  const leaderId = (row.leader_id as string | null) ?? null;
  return {
    id: row.id as string,
    teamNo: (row.team_no as number | null) ?? null,
    proposalId: (row.proposal_id as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    leaderId,
    leaderName: (leaderId && names.get(leaderId)) || UNKNOWN_AUTHOR,
    teamName: row.team_name as string,
    projectItem: row.project_item as string,
    members: parseTeamMembers(row.members),
    status: ((row.status as string) === "Completed" ? "Completed" : "Activities") as TeamStatus,
    createdAt: row.created_at as string,
    commentCount: counts.get(row.id as string) ?? 0,
  };
};

export async function getTeams(): Promise<CourseTeam[]> {
  const { data, error } = await requireClient()
    .from("team_registrations")
    .select(TEAM_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RecruitRow[];
  const [names, counts] = await Promise.all([
    getProfileNames(rows.map((row) => row.leader_id as string)),
    getCommentCounts("team"),
  ]);
  return rows.map((row) => toTeam(row, names, counts));
}

export async function getTeam(id: string): Promise<CourseTeam | null> {
  const { data, error } = await requireClient().from("team_registrations").select(TEAM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecruitRow;
  const [names, counts] = await Promise.all([
    getProfileNames([row.leader_id as string]),
    getCommentCounts("team"),
  ]);
  return toTeam(row, names, counts);
}

/**
 * 내가 팀장인 팀. 결과물 등록 폼이 "어느 팀 것인지"를 고르게 하려면 필요합니다.
 * 로그인하지 않았으면 빈 배열입니다(폼 자체가 열리지 않습니다).
 */
export async function getMyLedTeams(): Promise<CourseTeam[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await requireClient()
    .from("team_registrations")
    .select(TEAM_COLUMNS)
    .eq("semester_key", COURSE.key)
    .eq("leader_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const names = await getProfileNames([userId]);
  return ((data ?? []) as RecruitRow[]).map((row) => toTeam(row, names, new Map()));
}

export interface TeamInput {
  teamName: string;
  projectItem: string;
  members: TeamMember[];
}

export async function createTeam(input: TeamInput): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("team_registrations")
    .insert({
      ...semesterColumns(),
      leader_id: userId,
      team_name: input.teamName.trim(),
      project_item: input.projectItem.trim(),
      members: input.members,
      status: "Activities",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateTeam(id: string, input: TeamInput) {
  const { error } = await requireClient()
    .from("team_registrations")
    .update({
      team_name: input.teamName.trim(),
      project_item: input.projectItem.trim(),
      members: input.members,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** 확정. 번호는 DB가 붙입니다 — 동시에 두 사람이 확정해도 번호가 겹치지 않도록. */
export async function confirmTeam(id: string): Promise<number> {
  const { data, error } = await requireClient().rpc("confirm_team", { target: id });
  if (error) throw error;
  return data as number;
}

export async function unconfirmTeam(id: string) {
  const { error } = await requireClient().rpc("unconfirm_team", { target: id });
  if (error) throw error;
}

/**
 * 기업 제안에 팀을 배정합니다. `null`이면 배정을 뗍니다.
 *
 * 운영진만 할 수 있고, 그 경계는 028의 트리거입니다 — 화면에서 버튼을 감추는 것과 별개로
 * 미확정 팀의 팀장은 자기 팀 행을 고칠 수 있기 때문입니다.
 */
export async function assignTeamProposal(teamId: string, proposalId: string | null) {
  const { error } = await requireClient()
    .from("team_registrations")
    .update({ proposal_id: proposalId, updated_at: new Date().toISOString() })
    .eq("id", teamId);
  if (error) throw error;
}

export async function setTeamStatus(id: string, status: TeamStatus) {
  const { error } = await requireClient()
    .from("team_registrations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTeam(id: string) {
  const { error } = await requireClient().from("team_registrations").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Q&A

const QUESTION_COLUMNS = "id, title, content, answered_at, author_id, created_at";

const toQuestion = (row: RecruitRow, names: Map<string, string>, counts: Map<string, number>): CourseQuestion => ({
  id: row.id as string,
  title: row.title as string,
  content: row.content as string,
  answeredAt: (row.answered_at as string | null) ?? null,
  authorId: row.author_id as string,
  authorName: names.get(row.author_id as string) ?? UNKNOWN_AUTHOR,
  createdAt: row.created_at as string,
  commentCount: counts.get(row.id as string) ?? 0,
});

export async function getQuestions(): Promise<CourseQuestion[]> {
  const { data, error } = await requireClient()
    .from("course_questions")
    .select(QUESTION_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RecruitRow[];
  const [names, counts] = await Promise.all([
    getProfileNames(rows.map((row) => row.author_id as string)),
    getCommentCounts("qna"),
  ]);
  return rows.map((row) => toQuestion(row, names, counts));
}

export async function getQuestion(id: string): Promise<CourseQuestion | null> {
  const { data, error } = await requireClient().from("course_questions").select(QUESTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecruitRow;
  const [names, counts] = await Promise.all([
    getProfileNames([row.author_id as string]),
    getCommentCounts("qna"),
  ]);
  return toQuestion(row, names, counts);
}

export async function createQuestion(input: { title: string; content: string }): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("course_questions")
    .insert({ ...semesterColumns(), author_id: userId, title: input.title.trim(), content: input.content.trim() })
    .select("id")
    .single();
  if (error) throw error;

  // 질문이 올라간 것을 운영진에게 알립니다. 실패해도 질문 등록은 이미 끝났습니다 —
  // 알림 때문에 질문이 안 올라가면 본말이 뒤집힙니다.
  void notifyStaffOfQuestion(data.id as string).catch(() => undefined);
  return data.id as string;
}

export async function updateQuestion(id: string, input: { title: string; content: string }) {
  const { error } = await requireClient()
    .from("course_questions")
    .update({ title: input.title.trim(), content: input.content.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** 운영진이 답변 완료로 표시합니다. 목록에서 미답변 질문만 골라 보기 위한 값입니다. */
export async function setQuestionAnswered(id: string, answered: boolean) {
  const { error } = await requireClient()
    .from("course_questions")
    .update({ answered_at: answered ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteQuestion(id: string) {
  const { error } = await requireClient().from("course_questions").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 새 질문을 운영진 메일로 알립니다.
 *
 * 서버 라우트를 거칩니다 — 메일 발송 키는 브라우저에 둘 수 없고, 운영진 메일 주소도
 * 화면에 내려보내지 않습니다(025에서 명단을 운영진에게만 연 것과 같은 이유).
 * 발송 수단이 설정되지 않은 환경에서는 서버가 조용히 넘어갑니다.
 */
async function notifyStaffOfQuestion(questionId: string) {
  const headers = await getAuthHeaders();
  await fetch("/api/course/notify-question", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ questionId }),
  });
}

// ---------------------------------------------------------------- 결과물

const DELIVERABLE_COLUMNS =
  "id, team_id, phase, title, summary, tech_stack, demo_url, repo_url, deck_url, video_url, created_by, created_at, updated_at";

const toDeliverable = (row: RecruitRow, teamNames: Map<string, string>, counts: Map<string, number>): Deliverable => ({
  id: row.id as string,
  teamId: row.team_id as string,
  teamName: teamNames.get(row.team_id as string) ?? "삭제된 팀",
  phase: ((row.phase as string) === "final" ? "final" : "midterm") as DeliverablePhase,
  title: row.title as string,
  summary: (row.summary as string) ?? "",
  techStack: parseStringArray(row.tech_stack),
  demoUrl: (row.demo_url as string | null) ?? null,
  repoUrl: (row.repo_url as string | null) ?? null,
  deckUrl: (row.deck_url as string | null) ?? null,
  videoUrl: (row.video_url as string | null) ?? null,
  createdBy: row.created_by as string,
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
  commentCount: counts.get(row.id as string) ?? 0,
});

/** 결과물 카드에는 팀 이름이 함께 나옵니다. 팀 이름은 team_registrations에만 있어 따로 모읍니다. */
async function getTeamNames(teamIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(teamIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data } = await requireClient().from("team_registrations").select("id, team_name").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id as string, row.team_name as string]));
}

export async function getDeliverables(): Promise<Deliverable[]> {
  const { data, error } = await requireClient()
    .from("team_deliverables")
    .select(DELIVERABLE_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RecruitRow[];
  const [teamNames, counts] = await Promise.all([
    getTeamNames(rows.map((row) => row.team_id as string)),
    getCommentCounts("showcase"),
  ]);
  return rows.map((row) => toDeliverable(row, teamNames, counts));
}

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  const { data, error } = await requireClient().from("team_deliverables").select(DELIVERABLE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecruitRow;
  const [teamNames, counts] = await Promise.all([
    getTeamNames([row.team_id as string]),
    getCommentCounts("showcase"),
  ]);
  return toDeliverable(row, teamNames, counts);
}

export interface DeliverableInput {
  teamId: string;
  phase: DeliverablePhase;
  title: string;
  summary: string;
  techStack: string[];
  demoUrl: string | null;
  repoUrl: string | null;
  deckUrl: string | null;
  videoUrl: string | null;
}

/**
 * 등록과 수정이 같은 경로입니다. 팀당 단계별 한 건(UNIQUE team_id, phase)이라
 * 두 번째 등록은 새 글이 아니라 앞선 글의 갱신이어야 합니다. 새 행이 쌓이면
 * 보는 사람이 어느 것이 최종본인지 알 수 없습니다.
 */
export async function saveDeliverable(input: DeliverableInput): Promise<string> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("team_deliverables")
    .upsert(
      {
        team_id: input.teamId,
        semester_key: COURSE.key,
        phase: input.phase,
        title: input.title.trim(),
        summary: input.summary.trim(),
        tech_stack: input.techStack,
        demo_url: input.demoUrl,
        repo_url: input.repoUrl,
        deck_url: input.deckUrl,
        video_url: input.videoUrl,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,phase" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteDeliverable(id: string) {
  const { error } = await requireClient().from("team_deliverables").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- 댓글

export async function getComments(board: BoardId, targetId: string): Promise<CourseComment[]> {
  const { data, error } = await requireClient()
    .from("course_comments")
    .select("id, board, target_id, author_id, content, created_at, updated_at")
    .eq("board", board)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as RecruitRow[];
  const names = await getProfileNames(rows.map((row) => row.author_id as string));
  return rows.map((row) => ({
    id: row.id as string,
    board: row.board as BoardId,
    targetId: row.target_id as string,
    authorId: row.author_id as string,
    authorName: names.get(row.author_id as string) ?? UNKNOWN_AUTHOR,
    content: row.content as string,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  }));
}

export async function addComment(board: BoardId, targetId: string, content: string): Promise<CourseComment> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("댓글 내용을 입력해 주세요.");
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("course_comments")
    .insert({ board, target_id: targetId, author_id: userId, content: trimmed })
    .select("id, board, target_id, author_id, content, created_at, updated_at")
    .single();
  if (error) throw error;
  // "나"로 두면 새로고침한 순간 실제 이름으로 바뀌어, 방금 쓴 댓글이 남의 것처럼 보입니다.
  const names = await getProfileNames([userId]);
  return {
    id: data.id as string,
    board: data.board as BoardId,
    targetId: data.target_id as string,
    authorId: data.author_id as string,
    authorName: names.get(userId) ?? UNKNOWN_AUTHOR,
    content: data.content as string,
    createdAt: data.created_at as string,
    updatedAt: (data.updated_at as string) ?? (data.created_at as string),
  };
}

export async function updateComment(id: string, content: string): Promise<CourseComment> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("댓글 내용을 입력해 주세요.");
  const { data, error } = await requireClient()
    .from("course_comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, board, target_id, author_id, content, created_at, updated_at")
    .single();
  if (error) throw error;
  const names = await getProfileNames([data.author_id as string]);
  return {
    id: data.id as string,
    board: data.board as BoardId,
    targetId: data.target_id as string,
    authorId: data.author_id as string,
    authorName: names.get(data.author_id as string) ?? UNKNOWN_AUTHOR,
    content: data.content as string,
    createdAt: data.created_at as string,
    updatedAt: (data.updated_at as string) ?? (data.created_at as string),
  };
}

export async function deleteComment(id: string) {
  const { error } = await requireClient().from("course_comments").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- 수강생 프로필

const SEMESTER_PROFILE_COLUMNS =
  "id, user_id, full_name, role, major, bio, tech_stack, github_url, portfolio_url, status, created_at";

const toSemesterProfile = (row: RecruitRow, counts: Map<string, number> = new Map()): SemesterProfile => ({
  id: row.id as string,
  userId: row.user_id as string,
  fullName: row.full_name as string,
  major: (row.major as string | null) ?? "",
  role: (row.role as string | null) ?? "",
  bio: (row.bio as string | null) ?? "",
  techStack: parseStringArray(row.tech_stack),
  githubUrl: (row.github_url as string | null) ?? null,
  portfolioUrl: (row.portfolio_url as string | null) ?? null,
  status: (["LOOKING", "TEAMED", "DONE"].includes(row.status as string) ? row.status : "LOOKING") as StudentStatus,
  createdAt: row.created_at as string,
  commentCount: counts.get(row.id as string) ?? 0,
});

/** 자기소개 게시판 목록. 팀을 찾는 사람이 위에 오도록 상태 순으로 정렬합니다. */
export async function getSemesterProfiles(): Promise<SemesterProfile[]> {
  const { data, error } = await requireClient()
    .from("semester_profiles")
    .select(SEMESTER_PROFILE_COLUMNS)
    .eq("semester_key", COURSE.key)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const counts = await getCommentCounts("intro");
  return ((data ?? []) as RecruitRow[]).map((row) => toSemesterProfile(row, counts));
}

export async function getSemesterProfileById(id: string): Promise<SemesterProfile | null> {
  const { data, error } = await requireClient()
    .from("semester_profiles")
    .select(SEMESTER_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toSemesterProfile(data as RecruitRow, await getCommentCounts("intro"));
}

export async function deleteSemesterProfile(id: string) {
  const { error } = await requireClient().from("semester_profiles").delete().eq("id", id);
  if (error) throw error;
}

/** 내 이번 학기 프로필. 아직 안 썼으면 null이고, 워크스페이스가 작성부터 안내합니다. */
export async function getMySemesterProfile(): Promise<SemesterProfile | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;
  const { data, error } = await requireClient()
    .from("semester_profiles")
    .select(SEMESTER_PROFILE_COLUMNS)
    .eq("semester_key", COURSE.key)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toSemesterProfile(data as RecruitRow) : null;
}

export interface SemesterProfileInput {
  fullName: string;
  major: string;
  role: string;
  bio: string;
  techStack: string[];
  githubUrl: string | null;
  portfolioUrl: string | null;
  status: StudentStatus;
}

/**
 * 등록과 수정이 같은 경로입니다. `UNIQUE (user_id, semester_key)`라 학기당 한 장이며,
 * 학기가 바뀌면 새 행이 생기고 지난 학기 프로필은 그대로 남습니다.
 */
export async function saveSemesterProfile(input: SemesterProfileInput): Promise<SemesterProfile> {
  const userId = await requireAuthUserId();
  const { data, error } = await requireClient()
    .from("semester_profiles")
    .upsert(
      {
        ...semesterColumns(),
        user_id: userId,
        full_name: input.fullName.trim(),
        major: input.major.trim(),
        role: input.role.trim(),
        bio: input.bio.trim(),
        tech_stack: input.techStack,
        github_url: input.githubUrl,
        portfolio_url: input.portfolioUrl,
        status: input.status,
      },
      { onConflict: "user_id,semester_key" },
    )
    .select(SEMESTER_PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return toSemesterProfile(data as RecruitRow);
}

// ---------------------------------------------------------------- 내 활동

export interface StudentActivity {
  profile: SemesterProfile | null;
  posts: RecruitPost[];
  teams: CourseTeam[];
  deliverables: Deliverable[];
}

/**
 * 내가 팀원으로 들어가 있는 팀.
 *
 * team_registrations.members는 이름 문자열만 담습니다(등록 폼이 이름을 받으므로).
 * 사용자 id로 이을 길이 없어 이름으로 맞춥니다 — 팀장인 팀은 leader_id로 확실하게
 * 잡고, 팀원으로 참여한 팀만 이 경로로 찾습니다.
 *
 * ponytail: 동명이인이면 남의 팀이 섞입니다. 팀 등록에서 팀원을 계정으로 고르게
 * 바꾸면 member_ids로 정확해집니다 — 지금은 등록 폼이 이름을 받으므로 여기까지입니다.
 */
async function getTeamsByMemberName(name: string): Promise<RecruitRow[]> {
  if (!name.trim()) return [];
  const { data } = await requireClient()
    .from("team_registrations")
    .select(TEAM_COLUMNS)
    .eq("semester_key", COURSE.key)
    .contains("members", [{ name: name.trim() }]);
  return (data ?? []) as RecruitRow[];
}

/**
 * 수강생 워크스페이스가 한 번에 필요로 하는 것 전부.
 *
 * 화면이 조회를 네 번 따로 걸면 카드마다 로딩이 어긋나 화면이 계속 출렁입니다.
 * 서로 의존하지 않는 조회라 한꺼번에 보냅니다.
 */
export async function getMyCourseActivity(): Promise<StudentActivity> {
  const userId = await getAuthUserId();
  if (!userId) return { profile: null, posts: [], teams: [], deliverables: [] };
  const client = requireClient();

  const [profile, postRows, ledRows] = await Promise.all([
    getMySemesterProfile(),
    client
      .from("recruitment_posts")
      .select(RECRUIT_COLUMNS)
      .eq("semester_key", COURSE.key)
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => (data ?? []) as RecruitRow[]),
    client
      .from("team_registrations")
      .select(TEAM_COLUMNS)
      .eq("semester_key", COURSE.key)
      .eq("leader_id", userId)
      .then(({ data }) => (data ?? []) as RecruitRow[]),
  ]);

  // 이름은 학기 프로필을 먼저 봅니다. 계정 이름과 다르게 적었다면 팀 명단에 적힌 쪽도 그쪽입니다.
  const names = await getProfileNames([userId]);
  const myName = profile?.fullName || names.get(userId) || "";
  const memberRows = await getTeamsByMemberName(myName).catch(() => [] as RecruitRow[]);

  // 팀장이면서 명단에도 이름이 있으면 두 경로에 같은 팀이 잡힙니다.
  const teamRows = Array.from(
    new Map([...ledRows, ...memberRows].map((row) => [row.id as string, row])).values(),
  );

  const teamIds = teamRows.map((row) => row.id as string);
  const { data: deliverableRows } = teamIds.length
    ? await client.from("team_deliverables").select(DELIVERABLE_COLUMNS).in("team_id", teamIds)
    : { data: [] };

  const teamNames = new Map(teamRows.map((row) => [row.id as string, row.team_name as string]));
  const empty = new Map<string, number>();

  return {
    profile,
    posts: postRows.map((row) => toRecruitPost(row, names, empty)),
    teams: teamRows.map((row) => toTeam(row, names, empty)),
    deliverables: ((deliverableRows ?? []) as RecruitRow[]).map((row) => toDeliverable(row, teamNames, empty)),
  };
}

// ---------------------------------------------------------------- 과목 홈

export interface CourseStats {
  noticeCount: number;
  questionCount: number;
  introCount: number;
  recruitOpen: number;
  proposalCount: number;
  teamCount: number;
  deliverableCount: number;
}

/**
 * 과목 홈의 숫자 네 개.
 *
 * 목록 전체를 받지 않고 head 카운트만 씁니다. 홈은 첫 화면이라 가장 빨라야 하고,
 * 여기서 필요한 것은 "몇 건인가"뿐입니다.
 */
export async function getCourseStats(): Promise<CourseStats> {
  const client = requireClient();
  const count = async (table: string, filters: Record<string, string> = {}) => {
    let query = client.from(table).select("id", { count: "exact", head: true }).eq("semester_key", COURSE.key);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
    const { count: total, error } = await query;
    if (error) throw error;
    return total ?? 0;
  };

  const [noticeCount, questionCount, introCount, recruitOpen, proposalCount, teamCount, deliverableCount] = await Promise.all([
    count("course_notices"),
    count("course_questions"),
    count("semester_profiles"),
    count("recruitment_posts", { status: "Recruiting" }),
    count("corporate_proposals"),
    count("team_registrations"),
    count("team_deliverables"),
  ]);
  return { noticeCount, questionCount, introCount, recruitOpen, proposalCount, teamCount, deliverableCount };
}

/** 현재 로그인한 사용자 id. 화면이 "내 글인가"를 판단해 수정·삭제를 보여 줍니다. */
export const getViewerId = getAuthUserId;

/**
 * 지금 로그인한 계정(id와 메일 주소).
 *
 * `AuthService.getCurrentUser()`를 쓰지 않습니다. 그 함수는 `NEXT_PUBLIC_DEV_BYPASS`가
 * 켜져 있으면 실제 세션 대신 가짜 사용자를 돌려줍니다 — 창업자 워크스페이스를 로그인
 * 없이 열어 보기 위한 장치입니다. 과목 영역은 진짜 인증이 목적이라 그 장치를 보면 안
 * 됩니다. (그대로 뒀을 때 가입 화면이 열리자마자 "이미 로그인됨"으로 판단해 튕겼습니다.)
 *
 * 메일 주소가 필요한 이유: 자격이 없는 계정에게 "지금 어느 계정으로 로그인되어 있는지"를
 * 보여 줘야 무엇을 고쳐야 할지 압니다.
 */
/**
 * 과목 가입.
 *
 * `AuthService.signUp()`을 쓰지 않습니다. 그 함수는 StartUp Pilot 가입이라
 *   - 인증 메일 링크를 파일럿 콜백(`/auth/callback`)으로 보내고
 *   - `startup_profiles`에 `pre_founder / onboarding_complete:false` 행을 만듭니다
 * 그 결과 학교 메일로 가입한 학생이 인증 링크를 누르면 창업자 온보딩(팀 설정)으로
 * 떨어졌습니다. 과목 학생에게는 필요 없는 데이터이고, 필요 없는 화면입니다.
 *
 * `profiles` 행은 015의 `auth.users` 트리거가 만듭니다. 여기서 따로 넣지 않습니다.
 */
export async function signUpViewer(email: string, password: string, fullName: string) {
  const client = requireClient();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${origin}${COURSE_CALLBACK_HREF}`,
      // course 키가 이 계정이 과목 경로로 들어왔다는 표식입니다(isCourseAccount).
      data: { full_name: fullName.trim(), course: COURSE.key },
    },
  });
  if (error) throw error;
  return data;
}

export async function signOutViewer() {
  // `AuthService.signOut()`을 쓰지 않습니다. 그쪽은 DEV_BYPASS일 때 아무 일도 하지
  // 않고 돌아가서, 개발 중에는 실제 세션이 끊기지 않습니다(getViewerAccount와 짝이 어긋납니다).
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getViewerAccount(): Promise<{ id: string; email: string | null } | null> {
  const client = supabase;
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/**
 * 이 계정이 과목 구성원인가 — 한양대 메일 주소인가(027 이후 별도 인증은 없습니다).
 *
 * 판정은 DB 함수 하나(`is_course_member()`, 016)가 합니다. 화면에서 이메일을 다시
 * 뜯어보지 않는 이유는, 두 곳이 각자 판단하면 언젠가 어긋나고 그때 화면은 "쓸 수
 * 있다"고 하는데 저장은 거부되는 상태가 되기 때문입니다. 정책이 보는 그 함수에게
 * 그대로 물어봅니다.
 *
 * 실패하면 false입니다. 못 물어봤을 때 열어 주는 쪽으로 기울면, 016을 적용하지 않은
 * 환경에서 글쓰기 버튼이 열렸다가 저장에서 떨어집니다.
 */
export async function isCourseMember(): Promise<boolean> {
  const userId = await getAuthUserId();
  if (!userId) return false;
  const { data, error } = await requireClient().rpc("is_course_member");
  if (error) return false;
  return data === true;
}
