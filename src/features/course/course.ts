/**
 * 「SW창업캡스톤디자인」과목 도메인.
 *
 * 학기 상수·게시판 구성·순수 변환만 둡니다. React도 Supabase도 부르지 않아
 * 목록 정렬, 마감 계산, JSONB 파싱을 테스트에서 그대로 검증할 수 있습니다.
 */

import { getDday } from "@/features/startup-workspace/logic";

// ---------------------------------------------------------------- 학기

export interface CourseSemester {
  /** 모든 게시글 행에 박히는 학기 식별자. 한번 정하면 바꾸지 않습니다. */
  key: string;
  year: number;
  /** 학기. 1 또는 2. */
  term: "1" | "2";
  /** 과목명. 같은 학기에 다른 과목이 생겨도 섞이지 않도록 행에 함께 저장합니다. */
  track: string;
  label: string;
  school: string;
}

/**
 * 지금 열려 있는 학기. 다음 학기를 열 때는 이 상수만 바꾸고 지난 학기 글은
 * semester_key로 남습니다(지우지 않습니다).
 */
export const COURSE: CourseSemester = {
  key: "2026-2-swcap",
  year: 2026,
  term: "2",
  track: "SW창업캡스톤디자인",
  label: "2026년 2학기 SW창업캡스톤디자인",
  school: "한양대학교 ERICA",
};

/**
 * 가입 가능한 메일 도메인. 이 과목은 한양대 ERICA 수강생만 쓰는 곳입니다.
 *
 * 여기서 막는 것은 **안내**입니다. 실제 경계는 DB에 있습니다(016의 `is_course_member()`) —
 * `supabase.auth.signUp`은 브라우저가 anon 키로 직접 부르는 호출이라, 폼 검사만으로는
 * 개발자 도구를 연 사람에게 아무 의미가 없습니다. 두 곳의 규칙이 어긋나면 안 되므로
 * 아래 정규식과 016의 정규식은 같은 모양이어야 합니다.
 */
export const COURSE_EMAIL_DOMAIN = "hanyang.ac.kr";

/**
 * `@hanyang.ac.kr`과 그 하위 도메인(`@office.hanyang.ac.kr` 등)만 통과시킵니다.
 *
 * 단순히 "hanyang.ac.kr로 끝나는가"로 보면 안 됩니다.
 *   - `evil-hanyang.ac.kr` → 끝나기는 하지만 남의 도메인입니다. 앞이 점으로 끊겨야 합니다.
 *   - `hanyang.ac.kr.evil.com` → 끝이 아닙니다. 그래서 `$`로 닫습니다.
 */
const COURSE_EMAIL_PATTERN = /@(?:[a-z0-9-]+\.)*hanyang\.ac\.kr$/i;

export function isCourseEmail(email: string): boolean {
  const trimmed = email.trim();
  // 이메일 한 개인지부터 봅니다. `a@b@hanyang.ac.kr` 같은 값이 뒤 패턴만으로는 통과합니다.
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return false;
  return COURSE_EMAIL_PATTERN.test(trimmed);
}

/** 과목 전용 인증 경로. StartUp Pilot의 `/login`·`/signup`과 섞지 않습니다. */
export const COURSE_LOGIN_HREF = "/course/login";
export const COURSE_SIGNUP_HREF = "/course/signup";

/** 인증 메일의 링크가 돌아오는 곳. 파일럿의 `/auth/callback`과 분리합니다. */
export const COURSE_CALLBACK_HREF = "/course/auth/callback";

/**
 * 이 계정이 과목 경로로 가입했는가.
 *
 * 가입할 때 `user_metadata.course`에 학기 키를 남겨 둡니다. 인증 메일 링크나 비밀번호
 * 재설정이 파일럿 화면으로 돌아왔을 때, 이 학생을 창업자 온보딩(팀 설정)이 아니라
 * 과목으로 보내기 위한 표식입니다.
 *
 * 메일 도메인으로 판단하지 않습니다 — 한양대 메일을 쓰는 창업자가 파일럿에 가입할 수도
 * 있고, 그 사람을 과목으로 보내면 그쪽이 망가집니다. 어느 문으로 들어왔는지가 기준입니다.
 */
export const isCourseAccount = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== "object") return false;
  const value = (metadata as { course?: unknown }).course;
  return typeof value === "string" && value.trim().length > 0;
};

/** 행에 함께 저장하는 학기 컬럼 묶음. 등록 경로가 넷이라 한곳에서 만듭니다. */
export const semesterColumns = (semester: CourseSemester = COURSE) => ({
  semester_key: semester.key,
  academic_year: semester.year,
  academic_term: semester.term,
  course_track: semester.track,
});

// ---------------------------------------------------------------- 게시판

export type BoardId = "notice" | "qna" | "intro" | "recruit" | "proposal" | "team" | "showcase";

export interface BoardConfig {
  id: BoardId;
  label: string;
  /** 목록 화면 상단 한 줄. 이 게시판이 무엇을 위한 곳인지. */
  description: string;
  /** 글쓰기 버튼 문구. 게시판마다 하는 일이 달라 "새 글"로 뭉뚱그리지 않습니다. */
  createLabel: string;
  /** 로그인하지 않았을 때 글쓰기 버튼 자리에 놓는 안내. */
  emptyTitle: string;
  emptyDescription: string;
}

export const BOARDS: Record<BoardId, BoardConfig> = {
  notice: {
    id: "notice",
    label: "수업게시판",
    description: "담당 교수·조교가 올리는 공지입니다. 마감과 발표 순서가 여기로 모입니다. 궁금한 점은 댓글로 물어보세요.",
    createLabel: "공지 올리기",
    emptyTitle: "아직 공지가 없습니다",
    emptyDescription: "수업 일정과 제출 마감이 올라오면 여기에 모입니다.",
  },
  qna: {
    id: "qna",
    label: "Q&A",
    description: "수업·과제·팀빌딩에 대해 묻는 곳입니다. 담당 교수·조교가 댓글로 답합니다. 같은 질문이 이미 있는지 먼저 검색해 보세요.",
    createLabel: "질문하기",
    emptyTitle: "아직 질문이 없습니다",
    emptyDescription: "궁금한 점을 남겨 주세요. 다른 수강생에게도 도움이 됩니다.",
  },
  intro: {
    id: "intro",
    label: "자기소개",
    description: "이번 학기 수강생들이 스스로를 소개하는 곳입니다. 아이디어가 아직 없어도 괜찮습니다 — 무엇을 할 수 있는지만 적어 두면 팀이 찾아옵니다.",
    createLabel: "내 자기소개 등록",
    emptyTitle: "아직 등록된 자기소개가 없습니다",
    emptyDescription: "가장 먼저 올려 보세요. 전공과 할 수 있는 것만 적어도 충분합니다.",
  },
  recruit: {
    id: "recruit",
    label: "팀원모집",
    description: "함께할 팀원을 찾는 글입니다. 필요한 역할과 아이디어 단계를 적어 두면 지원자가 무엇을 준비할지 알 수 있습니다.",
    createLabel: "팀원 모집글 쓰기",
    emptyTitle: "아직 모집글이 없습니다",
    emptyDescription: "가장 먼저 올려 보세요. 아이디어가 한 줄이어도 괜찮습니다 — 관심 있는 사람이 댓글로 물어봅니다.",
  },
  proposal: {
    id: "proposal",
    label: "기업 제안 프로젝트",
    description: "기업이 들고 온 실제 문제입니다. 담당 교수·조교가 올리며, 참여하고 싶은 팀은 각 제안에 댓글로 신청합니다.",
    createLabel: "기업 제안 올리기",
    emptyTitle: "등록된 기업 제안이 없습니다",
    emptyDescription: "기업에서 받은 제안이 정리되면 여기에 올라옵니다.",
  },
  team: {
    id: "team",
    label: "팀등록",
    description: "팀 구성이 끝나면 팀장이 등록합니다. 등록된 팀만 기업 제안에 신청하고 중간·기말 결과물을 올릴 수 있습니다.",
    createLabel: "우리 팀 등록",
    emptyTitle: "등록된 팀이 없습니다",
    emptyDescription: "팀 구성이 끝났다면 팀장이 등록해 주세요. 결과물 게시판은 등록된 팀만 올릴 수 있습니다.",
  },
  showcase: {
    id: "showcase",
    label: "결과물",
    description: "중간·기말 산출물입니다. 팀당 단계별 한 건이며, 발표 전까지 같은 글을 고쳐 씁니다.",
    createLabel: "결과물 등록",
    emptyTitle: "아직 등록된 결과물이 없습니다",
    emptyDescription: "발표가 끝난 팀부터 데모 링크와 저장소를 남겨 주세요.",
  },
};

/**
 * 게시판 순서는 학기가 흘러가는 순서입니다.
 * 공지를 먼저 두고(수업게시판), 나를 알리고(자기소개) → 팀원을 찾고(팀원모집) →
 * 팀을 확정하고(팀등록) → 아이템을 고르고(기업 제안) → 결과를 냅니다(결과물).
 * 공지가 맨 앞인 이유는 학기 중에 가장 자주 확인하는 곳이기 때문입니다.
 *
 * 주소(`/course/recruit`, `/course/team`)는 그대로 둡니다 — 이름표가 바뀌었다고
 * 주소까지 바꾸면 이미 공유된 링크가 전부 깨집니다.
 */
export const BOARD_ORDER: BoardId[] = ["notice", "qna", "intro", "recruit", "team", "proposal", "showcase"];

/**
 * 주소의 `[board]` 자리가 우리가 아는 게시판인지.
 *
 * `value in BOARDS`로 쓰면 안 됩니다. `in`은 프로토타입 체인까지 봐서
 * `/course/__proto__`가 통과하고, 뒤이은 `BOARDS[board]`가 게시판 설정이 아닌
 * 것을 돌려주며 화면이 깨집니다. 아는 값과만 대조합니다.
 */
export const isBoardId = (value: string): value is BoardId => (BOARD_ORDER as string[]).includes(value);

export const courseHref = (board?: BoardId, id?: string) =>
  board ? (id ? `/course/${board}/${id}` : `/course/${board}`) : "/course";

/**
 * 수강생 워크스페이스.
 *
 * `/course/[board]`와 같은 자리에 있지만 정적 세그먼트라 Next가 먼저 잡습니다
 * (`isBoardId("me")`는 false이므로 게시판으로 새지도 않습니다).
 */
export const COURSE_WORKSPACE_HREF = "/course/me";

/** 수강생 명단(운영진 전용). */
export const COURSE_MEMBERS_HREF = "/course/members";

/** 상단 탭이 가리킬 수 있는 곳 전부. 게시판 + 과목 홈 + 내 워크스페이스 + 명단(운영진). */
export type CourseTab = BoardId | "home" | "me" | "members";

// ---------------------------------------------------------------- 값 목록

export type RecruitStatus = "Recruiting" | "Closed";

export const RECRUIT_STATUS_LABEL: Record<RecruitStatus, string> = {
  Recruiting: "모집 중",
  Closed: "모집 마감",
};

export type ProjectPhase = "IDEA" | "VALIDATION" | "PROTOTYPE" | "MVP";

export const PROJECT_PHASE_LABEL: Record<ProjectPhase, string> = {
  IDEA: "아이디어 구상",
  VALIDATION: "문제 검증",
  PROTOTYPE: "프로토타입",
  MVP: "MVP 운영",
};

export type DeliverablePhase = "midterm" | "final";

export const DELIVERABLE_PHASE_LABEL: Record<DeliverablePhase, string> = {
  midterm: "중간 결과물",
  final: "기말 결과물",
};

/**
 * 수강생의 이번 학기 상태.
 *
 * 팀빌딩 게시판에서 "이 사람 아직 팀 구하나?"가 가장 먼저 궁금한 값이라
 * 프로필 카드 맨 앞에 둡니다.
 */
export type StudentStatus = "LOOKING" | "TEAMED" | "DONE";

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  LOOKING: "팀 찾는 중",
  TEAMED: "팀 구성 완료",
  DONE: "수행 완료",
};

export const STUDENT_STATUS_TONE: Record<StudentStatus, "green" | "blue" | "slate"> = {
  LOOKING: "green",
  TEAMED: "blue",
  DONE: "slate",
};

export type TeamStatus = "Activities" | "Completed";

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  Activities: "활동 중",
  Completed: "수행 완료",
};

/** 모집글에서 자주 쓰는 역할. 직접 입력도 되지만 매번 타이핑하지 않게 미리 둡니다. */
export const ROLE_PRESETS = [
  "기획 · PM",
  "프론트엔드",
  "백엔드",
  "AI · 데이터",
  "디자인 · UX",
  "마케팅 · 영업",
  "하드웨어 · 임베디드",
];

export const PROPOSAL_CATEGORIES = [
  "AI · 데이터",
  "웹 · 앱 서비스",
  "제조 · 하드웨어",
  "커머스 · 물류",
  "헬스케어",
  "교육",
  "ESG · 사회문제",
];

// ---------------------------------------------------------------- 타입

export interface RecruitRole {
  role: string;
  count: number;
}

export interface TeamMember {
  name: string;
  role: string;
  /** 명단 파일에 들어갑니다. 자기소개의 전공과 별개로, 팀 명단은 팀장이 직접 적습니다. */
  major: string;
  studentId: string;
  /** 비고란의 팀장/팀원. 계정(leader_id)과 달리 명단에 적힌 사람 기준입니다. */
  isLeader: boolean;
}

export interface RecruitPost {
  id: string;
  authorId: string | null;
  authorName: string;
  title: string;
  content: string;
  tags: string[];
  projectPhase: ProjectPhase;
  recruitingRoles: RecruitRole[];
  status: RecruitStatus;
  createdAt: string;
  commentCount: number;
}

export interface Proposal {
  id: string;
  createdBy: string | null;
  companyName: string;
  title: string;
  content: string;
  categories: string[];
  deadline: string | null;
  contact: string;
  createdAt: string;
  commentCount: number;
}

export interface CourseTeam {
  id: string;
  /** 확정할 때 붙는 번호. 미확정이면 null입니다. */
  teamNo: number | null;
  /** 배정된 기업 제안. 운영진만 붙이고 뗍니다(028). 자체 아이템 팀은 null입니다. */
  proposalId: string | null;
  confirmedAt: string | null;
  leaderId: string | null;
  leaderName: string;
  teamName: string;
  projectItem: string;
  members: TeamMember[];
  status: TeamStatus;
  createdAt: string;
  commentCount: number;
}

export interface Deliverable {
  id: string;
  teamId: string;
  teamName: string;
  phase: DeliverablePhase;
  title: string;
  summary: string;
  techStack: string[];
  demoUrl: string | null;
  repoUrl: string | null;
  deckUrl: string | null;
  videoUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

/**
 * 이번 학기 수강생 프로필(`semester_profiles` 한 행).
 *
 * 계정 프로필(`profiles`)과 따로 둡니다. 전공·희망 역할·기술 스택은 학기마다
 * 달라지고, 지난 학기 프로필을 덮어쓰면 그때 팀을 구하던 기록이 사라집니다.
 *
 * `role` 컬럼은 스키마 기본값이 'Student'지만 이 화면에서는 **희망 역할**로 씁니다
 * (백엔드·기획 등). 쓰는 곳이 없던 컬럼이라 의미를 여기서 정합니다.
 */
export interface SemesterProfile {
  id: string;
  userId: string;
  fullName: string;
  major: string;
  role: string;
  bio: string;
  techStack: string[];
  githubUrl: string | null;
  portfolioUrl: string | null;
  status: StudentStatus;
  createdAt: string;
  commentCount: number;
}

export interface CourseNotice {
  id: string;
  title: string;
  content: string;
  /** 마감·발표 순서처럼 학기 내내 위에 있어야 하는 공지. */
  isPinned: boolean;
  createdBy: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

/** 고정 공지가 먼저, 그다음 최신순. 목록에서 이 규칙만 지키면 됩니다. */
export function sortNotices(notices: CourseNotice[]): CourseNotice[] {
  return [...notices].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * 게시판 맨 위에 붙는 안내. 게시판당 한 장이며 운영진만 씁니다.
 *
 * 게시판 설명(`BOARDS[].description`)은 코드 상수라 학기 중에 못 바꿉니다.
 * 제출 형식이나 마감처럼 학기마다 달라지는 이야기가 여기에 들어갑니다.
 */
export interface BoardGuide {
  id: string;
  board: BoardId;
  title: string;
  content: string;
  updatedAt: string;
  files: CourseFile[];
}

export interface CourseQuestion {
  id: string;
  title: string;
  content: string;
  /** 운영진이 답을 달면 채워집니다. "아직 답 없는 질문"을 골라내는 값입니다. */
  answeredAt: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  commentCount: number;
}

/** 답변 없는 질문이 먼저. 그다음 최신순 — 물어본 사람이 기다리고 있습니다. */
export function sortQuestions(questions: CourseQuestion[]): CourseQuestion[] {
  return [...questions].sort((a, b) => {
    const aOpen = a.answeredAt === null;
    const bOpen = b.answeredAt === null;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface CourseComment {
  id: string;
  board: BoardId;
  targetId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 고쳐진 댓글인가.
 *
 * 두 시각이 같아도 저장 지연으로 밀리초가 어긋날 수 있어, 1초 넘게 차이 날 때만
 * 수정으로 봅니다. 안 그러면 방금 쓴 댓글에도 "수정됨"이 붙습니다.
 */
export function isEdited(createdAt: string, updatedAt: string): boolean {
  const created = Date.parse(createdAt);
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  return updated - created > 1000;
}

/** 목록에 실리는 어떤 글이든 갖는 최소 공통분모. 검색·정렬이 이것만 봅니다. */
export type BoardEntry = CourseNotice | SemesterProfile | RecruitPost | Proposal | CourseTeam | Deliverable;

// ---------------------------------------------------------------- JSONB 파싱

/**
 * recruiting_roles·members는 JSONB라 어떤 모양이든 들어올 수 있습니다.
 * (예전 버전이 TEXT[]로 저장한 행도 남아 있습니다.)
 * 화면에서 `.map`을 부르기 전에 여기서 한 번 걸러 냅니다.
 */
export function parseRecruitRoles(value: unknown): RecruitRole[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [{ role: item.trim(), count: 1 }] : [];
    if (!item || typeof item !== "object") return [];
    const role = String((item as { role?: unknown }).role ?? "").trim();
    if (!role) return [];
    const count = Number((item as { count?: unknown }).count);
    return [{ role, count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1 }];
  });
}

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) return [];
  const read = (item: object, key: string) => String((item as Record<string, unknown>)[key] ?? "").trim();
  return value.flatMap((item) => {
    // 학과·학번이 없던 시절에 저장된 행이 남아 있습니다. 빈 값으로 채워 화면이 깨지지 않게 합니다.
    if (typeof item === "string") {
      return item.trim() ? [{ name: item.trim(), role: "", major: "", studentId: "", isLeader: false }] : [];
    }
    if (!item || typeof item !== "object") return [];
    const name = read(item, "name");
    if (!name) return [];
    return [{
      name,
      role: read(item, "role"),
      major: read(item, "major"),
      studentId: read(item, "studentId"),
      isLeader: (item as { isLeader?: unknown }).isLeader === true,
    }];
  });
}

export const parseStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

/** 쉼표로 구분해 입력한 태그를 배열로. 빈 값과 중복은 버립니다. */
export const splitTags = (value: string): string[] =>
  Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));

// ---------------------------------------------------------------- 화면 계산

/** 모집 중인 글이 위로. 같은 상태면 최신순. 마감된 글도 목록에서 지우지는 않습니다. */
export function sortRecruitPosts(posts: RecruitPost[]): RecruitPost[] {
  return [...posts].sort((a, b) => {
    if (a.status !== b.status) return a.status === "Recruiting" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** 모집 인원 합계. "3명 모집"처럼 한 줄로 보여 주기 위한 값입니다. */
export const countOpenRoles = (roles: RecruitRole[]) => roles.reduce((sum, item) => sum + item.count, 0);

/**
 * 기업 제안 마감까지 남은 일수와 그에 맞는 색.
 * 마감이 없으면 null이며, 지난 마감은 목록 아래로 내려갑니다.
 */
export function getProposalDeadline(deadline: string | null, now = new Date()) {
  const dday = getDday(deadline, now);
  if (dday === null) return null;
  const tone = dday < 0 ? "slate" : dday <= 3 ? "red" : dday <= 7 ? "amber" : "blue";
  const label = dday < 0 ? "마감" : dday === 0 ? "오늘 마감" : `D-${dday}`;
  return { dday, tone, label, expired: dday < 0 } as const;
}

/** 마감이 임박한 제안이 위로, 마감된 제안은 맨 아래로. 마감일이 없는 글은 최신순으로 그 사이에. */
export function sortProposals(proposals: Proposal[], now = new Date()): Proposal[] {
  const rank = (item: Proposal) => {
    const deadline = getProposalDeadline(item.deadline, now);
    if (!deadline) return 1;
    return deadline.expired ? 2 : 0;
  };
  return [...proposals].sort((a, b) => {
    const gap = rank(a) - rank(b);
    if (gap !== 0) return gap;
    if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** 결과물 게시판은 항상 중간/기말로 나눠 봅니다. 한 배열에 섞으면 무엇의 최종본인지 흐려집니다. */
export function groupDeliverables(deliverables: Deliverable[]): Record<DeliverablePhase, Deliverable[]> {
  const byPhase: Record<DeliverablePhase, Deliverable[]> = { midterm: [], final: [] };
  for (const item of deliverables) byPhase[item.phase].push(item);
  for (const phase of Object.keys(byPhase) as DeliverablePhase[]) {
    byPhase[phase].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return byPhase;
}

/**
 * 검색. 제목·본문뿐 아니라 역할·태그·팀원 이름까지 한 문자열로 훑습니다.
 * "백엔드"로 찾는 사람은 제목에 그 단어가 없어도 모집 역할에서 걸리길 기대합니다.
 */
export function matchesQuery(haystack: Array<string | null | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystack.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

// ---------------------------------------------------------------- 수강생 진행

export interface StudentProgressInput {
  hasProfile: boolean;
  recruitPostCount: number;
  teamCount: number;
  deliverablePhases: DeliverablePhase[];
}

export interface StudentStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

/**
 * 수강생 워크스페이스의 뼈대.
 *
 * "지금 뭘 해야 하지"를 게시판 네 개를 돌아다니며 유추하게 두지 않습니다.
 * 학기가 흐르는 순서 그대로 다섯 단계를 세우고, 각 단계가 끝났는지는 이미 있는
 * 데이터(프로필·모집글·팀·결과물)로 판정합니다. 별도 진행 상태를 저장하지 않으므로
 * 실제 게시판과 어긋날 일이 없습니다.
 *
 * 팀 등록은 모집글 없이도 할 수 있습니다(오프라인에서 팀을 짠 경우). 그래서 팀이
 * 있으면 '팀 찾기'도 끝난 것으로 봅니다 — 이미 지나온 단계를 미완으로 남겨 두면
 * 목록이 잔소리가 됩니다.
 */
export function getStudentSteps(input: StudentProgressInput): StudentStep[] {
  const hasTeam = input.teamCount > 0;
  return [
    {
      id: "profile",
      title: "자기소개 등록",
      description: "전공과 희망 역할을 적어 두면 다른 팀이 먼저 찾아옵니다.",
      done: input.hasProfile,
      href: courseHref("intro"),
      cta: "자기소개 작성",
    },
    {
      id: "recruit",
      title: "팀원 찾기",
      description: "모집글을 올리거나 관심 있는 글에 댓글로 지원합니다.",
      done: hasTeam || input.recruitPostCount > 0,
      href: courseHref("recruit"),
      cta: "모집 게시판 열기",
    },
    {
      id: "team",
      title: "확정 팀 등록",
      description: "구성이 끝나면 팀장이 등록합니다. 결과물은 등록된 팀만 올립니다.",
      done: hasTeam,
      href: courseHref("team"),
      cta: "팀 등록",
    },
    {
      id: "midterm",
      title: "중간 결과물 제출",
      description: "구현 범위와 검증한 것을 정리해 올립니다.",
      done: input.deliverablePhases.includes("midterm"),
      href: courseHref("showcase"),
      cta: "결과물 등록",
    },
    {
      id: "final",
      title: "기말 결과물 제출",
      description: "최종 산출물과 데모·저장소 링크를 남깁니다.",
      done: input.deliverablePhases.includes("final"),
      href: courseHref("showcase"),
      cta: "결과물 등록",
    },
  ];
}

/** 진행률과 다음에 할 일. 다음 단계는 "아직 안 끝난 첫 단계"입니다. */
export function getStudentProgress(steps: StudentStep[]) {
  const done = steps.filter((step) => step.done).length;
  return {
    done,
    total: steps.length,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
    next: steps.find((step) => !step.done) ?? null,
  };
}

/**
 * 목록·상세에 찍는 날짜. DB는 UTC로 저장하지만 읽는 사람은 전부 한국에 있어
 * 한국 시간으로 보여 줍니다(UTC 그대로 찍으면 밤에 쓴 글이 전날짜가 됩니다).
 */
export function formatDateTime(iso: string, withTime = false): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

// ---------------------------------------------------------------- 명단 내보내기

/** 명단 파일의 열. 교수님이 요청한 순서 그대로입니다. */
const ROSTER_HEADERS = ["팀번호", "팀명", "팀원이름", "역할", "학과", "학번", "비고"] as const;

/**
 * 한 칸을 CSV로 감쌉니다.
 *
 * 쉼표·따옴표·줄바꿈이 들어간 값(팀명에 쉼표, 역할에 줄바꿈)을 그대로 두면 열이 밀립니다.
 * 따옴표로 감싸고 안쪽 따옴표는 두 번 겹칩니다(RFC 4180).
 */
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * 확정된 팀을 명단 표로 폅니다. 팀원 한 명이 한 줄입니다.
 *
 * 엑셀 전용 형식(.xlsx) 대신 CSV로 냅니다 — 라이브러리를 하나 더 들이지 않고도
 * 엑셀이 그대로 엽니다. 다만 **BOM이 없으면 한글이 깨지므로** 파일을 만들 때 붙입니다.
 */
const byTeamNo = (a: CourseTeam, b: CourseTeam) => (a.teamNo ?? 0) - (b.teamNo ?? 0);

export function toRosterCsv(teams: CourseTeam[]): string {
  const rows: string[][] = [[...ROSTER_HEADERS]];

  for (const team of [...teams].sort(byTeamNo)) {
    // 팀원이 없으면 팀 줄이라도 남깁니다. 빈 팀이 명단에서 통째로 사라지면
    // 교수님이 누락을 알아챌 방법이 없습니다.
    const members = team.members.length > 0 ? team.members : [{ name: "", role: "", major: "", studentId: "", isLeader: false }];
    for (const member of members) {
      rows.push([
        team.teamNo === null ? "" : String(team.teamNo),
        team.teamName,
        member.name,
        member.role,
        member.major,
        member.studentId,
        member.isLeader ? "팀장" : member.name ? "팀원" : "",
      ]);
    }
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export const rosterFileName = (semester = COURSE) =>
  `${semester.year}-${semester.term}학기_${semester.track}_팀명단.csv`;

// ---------------------------------------------------------------- 배정 내보내기

/** 배정 파일의 열. 제안 한 건 + 팀 한 팀이 한 줄입니다. */
const ASSIGNMENT_HEADERS = [
  "기업명", "제안제목", "지원마감", "팀번호", "팀명", "프로젝트아이템", "팀장", "팀원수", "팀원",
] as const;

/** 배정도 미배정도 한눈에 보이도록, 빈 칸에 이 말을 적습니다. */
const NO_TEAM = "(배정된 팀 없음)";
const NO_PROPOSAL = "(미배정 팀)";

/** 명단의 팀장은 계정(leader_id)이 아니라 비고란에 팀장이라 적힌 사람입니다. */
const leaderNameOf = (team: CourseTeam) =>
  team.members.find((member) => member.isLeader)?.name || team.leaderName;

const teamCells = (team: CourseTeam): string[] => [
  team.teamNo === null ? "" : String(team.teamNo),
  team.teamName,
  team.projectItem,
  leaderNameOf(team),
  String(team.members.length),
  team.members.map((member) => member.name).filter(Boolean).join(", "),
];

/**
 * 기업 제안과 배정된 팀을 한 표로 폅니다.
 *
 * 배정된 팀이 없는 제안도, 어느 제안에도 붙지 않은 팀도 줄을 남깁니다 —
 * 양쪽 다 교수님이 학기 중에 찾아내야 하는 구멍이라, 파일에서 빠지면 볼 방법이 없습니다.
 *
 * 팀 명단(`toRosterCsv`)과 달리 팀원 한 명이 아니라 한 팀이 한 줄입니다.
 * 이 파일로 답하는 질문이 "이 프로젝트를 어느 팀이 맡았나"이기 때문입니다.
 */
export function toAssignmentCsv(proposals: Proposal[], teams: CourseTeam[]): string {
  const rows: string[][] = [[...ASSIGNMENT_HEADERS]];

  const sortedProposals = [...proposals].sort(
    (a, b) => a.companyName.localeCompare(b.companyName, "ko") || a.title.localeCompare(b.title, "ko"),
  );

  for (const proposal of sortedProposals) {
    const assigned = teams.filter((team) => team.proposalId === proposal.id).sort(byTeamNo);
    const head = [proposal.companyName, proposal.title, proposal.deadline ?? ""];
    if (assigned.length === 0) {
      rows.push([...head, "", NO_TEAM, "", "", "", ""]);
      continue;
    }
    for (const team of assigned) rows.push([...head, ...teamCells(team)]);
  }

  // 지워진 제안에 붙어 있던 팀(proposal_id가 남아 있어도 제안이 없는 경우)도 여기로 모입니다.
  const known = new Set(proposals.map((proposal) => proposal.id));
  const unassigned = teams.filter((team) => team.proposalId === null || !known.has(team.proposalId)).sort(byTeamNo);
  for (const team of unassigned) rows.push([NO_PROPOSAL, "", "", ...teamCells(team)]);

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export const assignmentFileName = (semester = COURSE) =>
  `${semester.year}-${semester.term}학기_${semester.track}_기업제안_팀배정.csv`;

// ---------------------------------------------------------------- 입력 검증

const MIN_TITLE = 2;
const MIN_CONTENT = 10;

/**
 * 저장 직전 검증. DB의 CHECK 제약이 진짜 경계이고, 이 함수는 그 거절을
 * 사용자가 읽을 수 있는 문장으로 앞당기는 역할입니다.
 * 통과하면 null, 막히면 보여 줄 문구를 돌려줍니다.
 */
export function validateTitleAndBody(title: string, content: string): string | null {
  if (title.trim().length < MIN_TITLE) return `제목은 ${MIN_TITLE}자 이상 입력해 주세요.`;
  if (content.trim().length < MIN_CONTENT) return `내용은 ${MIN_CONTENT}자 이상 입력해 주세요.`;
  return null;
}

/** 링크 칸은 비워 둘 수 있지만, 적었다면 열리는 주소여야 합니다. */
export function validateOptionalUrl(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return `${label}은(는) http/https 주소여야 합니다.`;
    return null;
  } catch {
    return `${label} 주소 형식을 확인해 주세요. (예: https://github.com/team/repo)`;
  }
}

/** Supabase가 거절하는 하한선과 같은 값입니다. 더 낮게 두면 서버에서만 막혀 이유가 늦게 보입니다. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * 가입 비밀번호 검사.
 *
 * 확인란을 따로 받는 이유는 가입이 되돌리기 어려운 입력이기 때문입니다 — 오타로 정한
 * 비밀번호는 로그인할 때가 되어서야 드러나고, 그때는 메일 재설정 말고 길이 없습니다.
 * 통과하면 null, 막히면 보여 줄 문구를 돌려줍니다.
 */
export function validateSignupPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  // 공백만 있는 비밀번호는 Supabase가 받지만 사람은 다시 입력하지 못합니다.
  if (!password.trim()) return "비밀번호에 공백 외의 문자를 넣어 주세요.";
  if (password !== confirm) return "비밀번호가 서로 다릅니다. 확인란을 다시 입력해 주세요.";
  return null;
}

// ---------------------------------------------------------------- 첨부파일

export interface CourseFile {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  createdBy: string;
}

/** 018의 버킷 용량 제한과 같은 값입니다. 다르면 화면은 통과시키고 업로드가 실패합니다. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** 파일 고르기 대화상자에 넘길 목록. 과업지시서·명세서·도면이 주로 올라옵니다. */
export const ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.hwp,.hwpx,.txt,.csv,.png,.jpg,.jpeg,.zip";

const ALLOWED_EXTENSIONS = ATTACHMENT_ACCEPT.split(",").map((item) => item.slice(1));

/**
 * 확장자. 없으면 빈 문자열입니다.
 *
 * `name.split(".").pop()`으로 쓰면 안 됩니다 — 점이 없는 이름은 이름 전체를 돌려주어,
 * `pdf`라는 이름의 확장자 없는 파일이 PDF로 통과합니다.
 * 앞자리 점(`.gitignore`)도 확장자가 아니라 숨김 파일이므로 `> 0`으로 봅니다.
 */
function extensionOf(fileName: string): string {
  const at = fileName.lastIndexOf(".");
  return at > 0 ? fileName.slice(at + 1).toLowerCase() : "";
}

/** 고르는 순간 막습니다. 등록을 누른 뒤에 거절하면 쓰던 글까지 붙잡힙니다. 통과하면 null. */
export function checkAttachment(file: { name: string; size: number }): string | null {
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `${file.name}: 올릴 수 없는 형식입니다. 문서·이미지·압축 파일만 첨부할 수 있습니다.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: 파일이 너무 큽니다. ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`;
  }
  if (file.size === 0) return `${file.name}: 빈 파일입니다.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 스토리지에 쓸 안전한 경로.
 *
 * 원래 파일명을 그대로 쓰면 한글·공백·괄호가 섞여 URL이 깨지거나 업로드가 거절됩니다.
 * 보여 줄 이름은 DB(`course_files.file_name`)에 따로 두고, 경로는 여기서 만듭니다.
 */
export function toStoragePath(folder: string, ownerId: string, fileName: string, unique: string): string {
  const extension = extensionOf(fileName).replace(/[^a-z0-9]/g, "");
  return `${folder}/${ownerId}/${unique}${extension ? `.${extension}` : ""}`;
}

/** 빈 문자열을 null로. 링크 칸을 비웠을 때 DB에 ""가 쌓이면 "링크 있음"으로 오인됩니다. */
export const emptyToNull = (value: string) => (value.trim() ? value.trim() : null);
