"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarClock, Download, Info, MessageSquare, Paperclip, Pencil, Pin, Plus, Search, Users } from "lucide-react";
import {
  confirmTeam,
  getBoardGuide,
  getDeliverables,
  getQuestions,
  getNotices,
  getProposals,
  getRecruitPosts,
  getProposalFileUrl,
  getSemesterProfiles,
  getTeams,
} from "@/lib/services/CourseService";
import {
  BOARDS,
  DELIVERABLE_PHASE_LABEL,
  PROJECT_PHASE_LABEL,
  PROPOSAL_CATEGORIES,
  RECRUIT_STATUS_LABEL,
  ROLE_PRESETS,
  STUDENT_STATUS_LABEL,
  STUDENT_STATUS_TONE,
  TEAM_STATUS_LABEL,
  countOpenRoles,
  assignmentFileName,
  courseHref,
  rosterFileName,
  sortNotices,
  sortQuestions,
  toAssignmentCsv,
  toRosterCsv,
  formatBytes,
  formatDateTime,
  getProposalDeadline,
  groupDeliverables,
  matchesQuery,
  sortProposals,
  sortRecruitPosts,
  type BoardId,
  type CourseTeam,
  type Deliverable,
  type DeliverablePhase,
  type Proposal,
  type BoardGuide,
  type CourseNotice,
  type CourseQuestion,
  type RecruitPost,
  type SemesterProfile,
  type StudentStatus,
} from "./course";
import { AuthorLabel, CourseShell, StaffBadge, WriteGate, useStaffIds, useViewer } from "./CourseChrome";
import { BoardGuideForm, DeliverableForm, NoticeForm, ProposalForm, QuestionForm, RecruitForm, SemesterProfileForm, TeamForm } from "./forms";
import {
  Button,
  ChoiceChip,
  EmptyState,
  Notice,
  Skeleton,
  StatusBadge,
  focusRing,
  inputClass,
  liftCard,
} from "@/features/startup-workspace/ui";
import { toMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const cardClass = cn("block rounded-2xl border border-[#E2E8F0] bg-white p-5", liftCard, focusRing);

/** 카드 아래줄에 공통으로 붙는 메타(작성일 · 댓글 수). 네 게시판이 같은 자리에 같은 모양으로 둡니다. */
function CardMeta({ createdAt, commentCount, children }: { createdAt: string; commentCount: number; children?: React.ReactNode }) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#94A3B8]">
      {children}
      <span className="tabular-nums">{formatDateTime(createdAt)}</span>
      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[#64748B]">
        <MessageSquare size={13} />
        <span className="tabular-nums">{commentCount}</span>
      </span>
    </div>
  );
}

function TagRow({ items, tone = "slate" }: { items: string[]; tone?: "slate" | "blue" }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold",
            tone === "blue" ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#F1F5F9] text-[#475569]",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 카드

function QuestionCard({ question, staffIds }: { question: CourseQuestion; staffIds: Set<string> }) {
  return (
    <Link href={courseHref("qna", question.id)} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={question.answeredAt ? "green" : "amber"} dot>
          {question.answeredAt ? "답변 완료" : "답변 대기"}
        </StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-6">{question.title}</h3>
      <p className="mt-2 line-clamp-2 break-keep text-sm leading-6 text-[#475569]">{question.content}</p>
      <CardMeta createdAt={question.createdAt} commentCount={question.commentCount}>
        <AuthorLabel name={question.authorName} authorId={question.authorId} staffIds={staffIds} className="text-[#475569]" />
      </CardMeta>
    </Link>
  );
}

function NoticeCard({ notice }: { notice: CourseNotice }) {
  return (
    <Link
      href={courseHref("notice", notice.id)}
      className={cn(cardClass, notice.isPinned && "border-[#2563EB] bg-[#F8FAFC]")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {notice.isPinned && (
          <StatusBadge tone="blue">
            <Pin size={11} className="mr-0.5 inline" />상단 고정
          </StatusBadge>
        )}
        <span className="text-sm font-semibold text-[#64748B]">{notice.authorName}</span>
        <StaffBadge />
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-6">{notice.title}</h3>
      <p className="mt-2 line-clamp-2 break-keep text-sm leading-6 text-[#475569]">{notice.content}</p>
      <CardMeta createdAt={notice.createdAt} commentCount={notice.commentCount} />
    </Link>
  );
}

/**
 * 자기소개 카드.
 *
 * 이름보다 "지금 팀을 찾는가"와 "무엇을 할 수 있는가"를 먼저 보여 줍니다 —
 * 이 게시판을 훑는 사람이 찾는 것이 그 둘이기 때문입니다.
 */
function IntroCard({ profile, isMine }: { profile: SemesterProfile; isMine: boolean }) {
  return (
    <Link
      href={courseHref("intro", profile.id)}
      className={cn(cardClass, isMine && "border-[#2563EB] ring-1 ring-[#BFDBFE]")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STUDENT_STATUS_TONE[profile.status]} dot>{STUDENT_STATUS_LABEL[profile.status]}</StatusBadge>
        {profile.role && profile.role !== "Student" && <StatusBadge tone="blue">{profile.role}</StatusBadge>}
        {isMine && <StatusBadge tone="slate">내 자기소개</StatusBadge>}
      </div>
      <h3 className="mt-3 text-lg font-bold leading-6">
        {profile.fullName}
        {profile.major && <span className="ml-2 text-sm font-semibold text-[#94A3B8]">{profile.major}</span>}
      </h3>
      {profile.bio && <p className="mt-2 line-clamp-3 break-keep text-sm leading-6 text-[#475569]">{profile.bio}</p>}
      <TagRow items={profile.techStack} tone="blue" />
      <CardMeta createdAt={profile.createdAt} commentCount={profile.commentCount} />
    </Link>
  );
}

function RecruitCard({ post, staffIds }: { post: RecruitPost; staffIds: Set<string> }) {
  return (
    <Link href={courseHref("recruit", post.id)} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={post.status === "Recruiting" ? "green" : "slate"} dot>
          {RECRUIT_STATUS_LABEL[post.status]}
        </StatusBadge>
        <StatusBadge tone="blue">{PROJECT_PHASE_LABEL[post.projectPhase]}</StatusBadge>
        {post.recruitingRoles.length > 0 && (
          <span className="text-sm font-semibold text-[#64748B]">{countOpenRoles(post.recruitingRoles)}명 모집</span>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-6">{post.title}</h3>
      <p className="mt-2 line-clamp-2 break-keep text-sm leading-6 text-[#475569]">{post.content}</p>
      <TagRow items={post.recruitingRoles.map((role) => `${role.role} ${role.count}`)} tone="blue" />
      <TagRow items={post.tags} />
      <CardMeta createdAt={post.createdAt} commentCount={post.commentCount}>
        <AuthorLabel name={post.authorName} authorId={post.authorId} staffIds={staffIds} className="text-[#475569]" />
      </CardMeta>
    </Link>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const deadline = getProposalDeadline(proposal.deadline);
  return (
    <Link href={courseHref("proposal", proposal.id)} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="slate">{proposal.companyName}</StatusBadge>
        <StaffBadge />
        {deadline ? (
          <StatusBadge tone={deadline.tone} dot={!deadline.expired}>{deadline.label}</StatusBadge>
        ) : (
          <StatusBadge tone="blue">상시 모집</StatusBadge>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-6">{proposal.title}</h3>
      <p className="mt-2 line-clamp-2 break-keep text-sm leading-6 text-[#475569]">{proposal.content}</p>
      <TagRow items={proposal.categories} tone="blue" />
      <CardMeta createdAt={proposal.createdAt} commentCount={proposal.commentCount}>
        {proposal.deadline && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CalendarClock size={13} />마감 {proposal.deadline}
          </span>
        )}
      </CardMeta>
    </Link>
  );
}

function TeamCard({ team, staffIds }: { team: CourseTeam; staffIds: Set<string> }) {
  return (
    <Link href={courseHref("team", team.id)} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        {team.teamNo !== null && <StatusBadge tone="blue">{team.teamNo}팀</StatusBadge>}
        {team.confirmedAt && <StatusBadge tone="green" dot>확정</StatusBadge>}
        <StatusBadge tone={team.status === "Activities" ? "blue" : "green"}>
          {TEAM_STATUS_LABEL[team.status]}
        </StatusBadge>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#64748B]">
          <Users size={14} />
          <span className="tabular-nums">{team.members.length}</span>명
        </span>
      </div>
      <h3 className="mt-3 text-lg font-bold leading-6">{team.teamName}</h3>
      <p className="mt-2 line-clamp-2 break-keep text-sm leading-6 text-[#475569]">{team.projectItem}</p>
      <TagRow items={team.members.map((member) => (member.role ? `${member.name} · ${member.role}` : member.name))} />
      <CardMeta createdAt={team.createdAt} commentCount={team.commentCount}>
        <AuthorLabel name={`팀장 ${team.leaderName}`} authorId={team.leaderId} staffIds={staffIds} className="text-[#475569]" />
      </CardMeta>
    </Link>
  );
}

function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  return (
    <Link href={courseHref("showcase", deliverable.id)} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={deliverable.phase === "final" ? "green" : "amber"}>
          {DELIVERABLE_PHASE_LABEL[deliverable.phase]}
        </StatusBadge>
        <StatusBadge tone="slate">{deliverable.teamName}</StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-6">{deliverable.title}</h3>
      <p className="mt-2 line-clamp-3 break-keep text-sm leading-6 text-[#475569]">{deliverable.summary}</p>
      <TagRow items={deliverable.techStack} tone="blue" />
      <CardMeta createdAt={deliverable.updatedAt} commentCount={deliverable.commentCount} />
    </Link>
  );
}

// ---------------------------------------------------------------- 목록

type BoardData =
  | { board: "notice"; items: CourseNotice[] }
  | { board: "qna"; items: CourseQuestion[] }
  | { board: "intro"; items: SemesterProfile[] }
  | { board: "recruit"; items: RecruitPost[] }
  | { board: "proposal"; items: Proposal[] }
  | { board: "team"; items: CourseTeam[] }
  | { board: "showcase"; items: Deliverable[] };

const loaders: Record<BoardId, () => Promise<BoardData>> = {
  notice: async () => ({ board: "notice", items: await getNotices() }),
  qna: async () => ({ board: "qna", items: await getQuestions() }),
  intro: async () => ({ board: "intro", items: await getSemesterProfiles() }),
  recruit: async () => ({ board: "recruit", items: await getRecruitPosts() }),
  proposal: async () => ({ board: "proposal", items: await getProposals() }),
  team: async () => ({ board: "team", items: await getTeams() }),
  showcase: async () => ({ board: "showcase", items: await getDeliverables() }),
};

/** 게시판마다 다른 칩 한 줄. 전부 "전체 + 값들"이라 목록만 다르게 줍니다. */
const filterOptions: Record<BoardId, Array<{ value: string; label: string }>> = {
  // 공지는 양이 적고 고정/일반 둘뿐이라 칩을 두지 않습니다. 검색이면 충분합니다.
  notice: [],
  qna: [
    { value: "open", label: "답변 대기" },
    { value: "answered", label: "답변 완료" },
  ],
  intro: [
    ...(Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[]).map((status) => ({
      value: status,
      label: STUDENT_STATUS_LABEL[status],
    })),
    ...ROLE_PRESETS.map((role) => ({ value: `role:${role}`, label: role })),
  ],
  recruit: [
    { value: "Recruiting", label: RECRUIT_STATUS_LABEL.Recruiting },
    { value: "Closed", label: RECRUIT_STATUS_LABEL.Closed },
    ...ROLE_PRESETS.map((role) => ({ value: `role:${role}`, label: role })),
  ],
  proposal: PROPOSAL_CATEGORIES.map((item) => ({ value: item, label: item })),
  team: [
    { value: "Activities", label: TEAM_STATUS_LABEL.Activities },
    { value: "Completed", label: TEAM_STATUS_LABEL.Completed },
  ],
  showcase: (Object.keys(DELIVERABLE_PHASE_LABEL) as DeliverablePhase[]).map((phase) => ({
    value: phase,
    label: DELIVERABLE_PHASE_LABEL[phase],
  })),
};

/**
 * 게시판 맨 위 안내.
 *
 * 게시판 설명(BOARDS[].description)은 코드 상수라 학기 중에 못 바꿉니다. 그 아래
 * 운영진이 직접 쓰는 자리를 둡니다 — 제출 형식이나 마감처럼 학기마다 달라지는 이야기.
 */
function GuideBlock({
  board,
  guide,
  canEdit,
  onEdit,
}: {
  board: BoardId;
  guide: BoardGuide | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (!guide) {
    // 안내가 없으면 학생에게는 아무것도 보이지 않습니다. 운영진에게만 만들 길을 둡니다.
    if (!canEdit) return null;
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-5 py-4">
        <p className="text-sm text-[#64748B]">
          {BOARDS[board].label} 게시판 맨 위에 표시할 안내를 작성할 수 있습니다.
        </p>
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={onEdit}>안내 작성</Button>
      </div>
    );
  }

  return (
    <section className="animate-in mb-6 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-[#1D4ED8]">
          <Info size={17} className="shrink-0" />
          {guide.title || `${BOARDS[board].label} 안내`}
        </h2>
        {canEdit && (
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={onEdit}>안내 수정</Button>
        )}
      </div>

      {/* 작성자가 넣은 줄바꿈을 살립니다. 안내는 항목을 나열하는 글이라 한 덩어리로 붙으면 안 읽힙니다. */}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#334155]">{guide.content}</p>

      {guide.files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {guide.files.map((file) => (
            <li key={file.id}>
              <a
                href={getProposalFileUrl(file.storagePath)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-[#BFDBFE] bg-white px-4 py-2.5 transition-colors hover:border-[#2563EB]",
                  focusRing,
                )}
              >
                <Paperclip size={14} className="shrink-0 text-[#94A3B8]" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{file.fileName}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[#94A3B8]">{formatBytes(file.sizeBytes)}</span>
                <Download size={14} className="shrink-0 text-[#2563EB]" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 팀등록 게시판의 운영진 도구.
 *
 * 확정은 "이 명단으로 간다"는 선언입니다 — 확정하면 번호가 붙고, 그 팀은 학생이
 * 더 고칠 수 없습니다(026 정책). 그래서 내보내기도 확정된 팀만 담습니다.
 */
function downloadCsv(content: string, fileName: string) {
  // BOM(\uFEFF)이 없으면 엑셀이 UTF-8로 못 읽어 한글이 전부 깨집니다.
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RosterTools({ teams, onChanged }: { teams: CourseTeam[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const pending = teams.filter((team) => team.confirmedAt === null);
  const confirmed = teams.filter((team) => team.confirmedAt !== null);

  const confirmAll = async () => {
    if (!window.confirm(`미확정 ${pending.length}개 팀을 확정할까요? 확정 후에는 학생이 팀 정보를 고칠 수 없습니다.`)) return;
    setBusy(true);
    setNote(null);
    try {
      // 번호를 순서대로 받으려면 하나씩 보내야 합니다. 동시에 보내면 DB가 번호를
      // 겹치지 않게는 주지만, 등록 순서와 다른 번호가 붙습니다.
      for (const team of pending) await confirmTeam(team.id);
      onChanged();
    } catch (reason) {
      setNote(toMessage(reason, "확정하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <h2 className="text-base font-bold">팀 명단 관리</h2>
      <p className="mt-1.5 text-sm leading-6 text-[#475569]">
        확정 <strong className="tabular-nums text-[#16A34A]">{confirmed.length}</strong>개 ·
        미확정 <strong className="tabular-nums text-[#B45309]">{pending.length}</strong>개.
        확정하면 팀번호가 붙고 학생은 그 팀을 더 고칠 수 없습니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          icon={<BadgeCheck size={15} />}
          loading={busy}
          disabled={pending.length === 0}
          onClick={() => void confirmAll()}
        >
          미확정 {pending.length}개 모두 확정
        </Button>
        <Button variant="secondary" icon={<Download size={15} />} disabled={confirmed.length === 0} onClick={() => downloadCsv(toRosterCsv(confirmed), rosterFileName())}>
          확정 팀 명단 내려받기
        </Button>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#94A3B8]">
        파일에는 팀번호·팀명·팀원이름·역할·학과·학번·비고(팀장/팀원)가 들어갑니다.
        CSV 형식이라 엑셀에서 그대로 열립니다.
      </p>

      {note && <Notice tone="error" className="mt-3" onDismiss={() => setNote(null)}>{note}</Notice>}
    </section>
  );
}

/**
 * 기업 제안 게시판의 운영진 도구.
 *
 * 배정 자체는 각 제안 글에서 합니다 — 목록에서 제안마다 팀을 고르게 하면
 * 학생이 읽는 게시판이 배정 표가 됩니다. 여기서는 학기 전체 현황과 파일만 봅니다.
 */
function ProposalTools({ proposals }: { proposals: Proposal[] }) {
  const [teams, setTeams] = useState<CourseTeam[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getTeams()
      .then((rows) => { if (mounted) setTeams(rows); })
      .catch((reason) => { if (mounted) setNote(toMessage(reason, "팀 목록을 불러오지 못했습니다.")); });
    return () => { mounted = false; };
  }, []);

  const assigned = (teams ?? []).filter((team) => team.proposalId !== null);
  const withoutTeam = proposals.filter((proposal) => !assigned.some((team) => team.proposalId === proposal.id));

  return (
    <section className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <h2 className="text-base font-bold">기업 제안 배정 관리</h2>
      <p className="mt-1.5 text-sm leading-6 text-[#475569]">
        배정 <strong className="tabular-nums text-[#16A34A]">{assigned.length}</strong>팀 ·
        미배정 <strong className="tabular-nums text-[#B45309]">{(teams?.length ?? 0) - assigned.length}</strong>팀 ·
        아직 팀이 없는 제안 <strong className="tabular-nums text-[#B45309]">{withoutTeam.length}</strong>건.
        배정은 각 제안 글을 열어서 합니다.
      </p>

      <div className="mt-4">
        <Button
          variant="secondary"
          icon={<Download size={15} />}
          disabled={teams === null}
          onClick={() => downloadCsv(toAssignmentCsv(proposals, teams ?? []), assignmentFileName())}
        >
          제안·팀 배정 내려받기
        </Button>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#94A3B8]">
        파일에는 기업명·제안제목·지원마감·팀번호·팀명·프로젝트아이템·팀장·팀원수·팀원이 들어갑니다.
        팀이 배정되지 않은 제안과 어느 제안에도 붙지 않은 팀도 함께 담깁니다. CSV 형식이라 엑셀에서 그대로 열립니다.
      </p>

      {note && <Notice tone="error" className="mt-3" onDismiss={() => setNote(null)}>{note}</Notice>}
    </section>
  );
}

export function BoardListPage({ board }: { board: BoardId }) {
  const config = BOARDS[board];
  const router = useRouter();
  const viewer = useViewer();
  const staffIds = useStaffIds();
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [writing, setWriting] = useState(false);
  const [guide, setGuide] = useState<BoardGuide | null>(null);
  const [editingGuide, setEditingGuide] = useState(false);

  useEffect(() => {
    let mounted = true;
    setData(null);
    setGuide(null);
    setQuery("");
    setFilter("all");
    // 안내를 못 읽어도 목록은 떠야 합니다. 안내는 덧붙는 정보입니다.
    getBoardGuide(board).then((row) => { if (mounted) setGuide(row); }).catch(() => undefined);
    loaders[board]()
      .then((loaded) => { if (mounted) setData(loaded); })
      .catch((reason) => {
        if (!mounted) return;
        setError(toMessage(reason, "목록을 불러오지 못했습니다."));
        setData({ board, items: [] } as BoardData);
      });
    return () => { mounted = false; };
  }, [board]);

  const visible = useMemo(() => filterBoard(data, query, filter), [data, query, filter]);
  const visibleCount = visible ? visible.items.length : 0;

  // 자기소개는 학기당 한 장이라 "새 글"이 아닙니다. 이미 올렸다면 버튼도 그렇게 말해야 합니다.
  const myIntro =
    data?.board === "intro" ? data.items.find((item) => item.userId === viewer.id) ?? null : null;
  const createLabel = board === "intro" && myIntro ? "내 자기소개 수정" : config.createLabel;

  const onCreated = (id: string) => {
    setWriting(false);
    router.push(courseHref(board, id));
  };

  return (
    <CourseShell active={board}>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight md:text-[32px]">{config.label}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">{config.description}</p>
        </div>
        <div className="shrink-0 md:max-w-md">
          <WriteGate viewer={viewer} action={createLabel} staffOnly={board === "notice" || board === "proposal"}>
            <Button size="lg" icon={<Plus size={16} />} onClick={() => setWriting(true)}>{createLabel}</Button>
          </WriteGate>
        </div>
      </header>

      <div className="mb-6 space-y-3">
        <div className="relative flex items-center">
          <Search size={18} className="pointer-events-none absolute left-4 text-[#94A3B8]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${config.label} 검색`}
            aria-label={`${config.label} 검색`}
            className={cn(inputClass, "mt-0 h-12 rounded-xl bg-white pl-12")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip selected={filter === "all"} onClick={() => setFilter("all")}>전체</ChoiceChip>
          {filterOptions[board].map((option) => (
            <ChoiceChip key={option.value} selected={filter === option.value} onClick={() => setFilter(option.value)}>
              {option.label}
            </ChoiceChip>
          ))}
        </div>
      </div>

      <GuideBlock board={board} guide={guide} canEdit={viewer.staff} onEdit={() => setEditingGuide(true)} />

      {board === "team" && viewer.staff && data?.board === "team" && (
        <RosterTools teams={data.items} onChanged={() => loaders.team().then(setData).catch(() => undefined)} />
      )}

      {board === "proposal" && viewer.staff && data?.board === "proposal" && (
        <ProposalTools proposals={data.items} />
      )}

      {error && <Notice tone="error" className="mb-4" onDismiss={() => setError(null)}>{error}</Notice>}

      {data === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-48 w-full" />)}
        </div>
      ) : visibleCount === 0 ? (
        <EmptyState
          title={query || filter !== "all" ? "조건에 맞는 글이 없습니다" : config.emptyTitle}
          description={query || filter !== "all" ? "검색어나 필터를 바꿔 보세요." : config.emptyDescription}
          action={
            query || filter !== "all" ? (
              <Button variant="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>필터 초기화</Button>
            ) : (
              <WriteGate viewer={viewer} action={createLabel} staffOnly={board === "notice" || board === "proposal"}>
                <Button onClick={() => setWriting(true)} icon={<Plus size={15} />}>{createLabel}</Button>
              </WriteGate>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-[#64748B]">
            <strong className="font-bold tabular-nums text-[#0F172A]">{visibleCount}</strong>건
          </p>
          <div className="animate-in-stagger grid gap-4 md:grid-cols-2">
            {visible?.board === "notice" && visible.items.map((item) => <NoticeCard key={item.id} notice={item} />)}
            {visible?.board === "qna" && visible.items.map((item) => (
              <QuestionCard key={item.id} question={item} staffIds={staffIds} />
            ))}
            {visible?.board === "intro" && visible.items.map((item) => (
              <IntroCard key={item.id} profile={item} isMine={item.userId === viewer.id} />
            ))}
            {visible?.board === "recruit" && visible.items.map((item) => <RecruitCard key={item.id} post={item} staffIds={staffIds} />)}
            {visible?.board === "proposal" && visible.items.map((item) => <ProposalCard key={item.id} proposal={item} />)}
            {visible?.board === "team" && visible.items.map((item) => <TeamCard key={item.id} team={item} staffIds={staffIds} />)}
            {visible?.board === "showcase" && visible.items.map((item) => <DeliverableCard key={item.id} deliverable={item} />)}
          </div>
        </>
      )}

      {editingGuide && (
        <BoardGuideForm
          board={board}
          current={guide}
          onClose={() => setEditingGuide(false)}
          onSaved={() => {
            setEditingGuide(false);
            getBoardGuide(board).then(setGuide).catch(() => undefined);
          }}
        />
      )}
      {writing && board === "notice" && <NoticeForm onClose={() => setWriting(false)} onCreated={onCreated} />}
      {writing && board === "qna" && <QuestionForm onClose={() => setWriting(false)} onCreated={onCreated} />}
      {writing && board === "intro" && (
        <SemesterProfileForm
          current={myIntro}
          onClose={() => setWriting(false)}
          onSaved={(profile) => onCreated(profile.id)}
        />
      )}
      {writing && board === "recruit" && <RecruitForm onClose={() => setWriting(false)} onCreated={onCreated} />}
      {writing && board === "proposal" && <ProposalForm onClose={() => setWriting(false)} onCreated={onCreated} />}
      {writing && board === "team" && <TeamForm onClose={() => setWriting(false)} onCreated={onCreated} />}
      {writing && board === "showcase" && <DeliverableForm onClose={() => setWriting(false)} onCreated={onCreated} />}
    </CourseShell>
  );
}

/**
 * 검색과 칩 필터를 게시판별로 적용합니다.
 *
 * 정렬도 여기서 끝냅니다 — 모집 중인 글과 마감이 임박한 제안이 위로 오는 규칙은
 * 화면이 아니라 도메인(course.ts)에 있고, 이 함수는 그것을 부르기만 합니다.
 */
function filterBoard(data: BoardData | null, query: string, filter: string): BoardData | null {
  if (!data) return null;

  if (data.board === "notice") {
    return {
      board: "notice",
      items: sortNotices(data.items).filter((item) => matchesQuery([item.title, item.content, item.authorName], query)),
    };
  }

  if (data.board === "qna") {
    return {
      board: "qna",
      items: sortQuestions(data.items).filter((item) => {
        if (filter === "open" && item.answeredAt !== null) return false;
        if (filter === "answered" && item.answeredAt === null) return false;
        return matchesQuery([item.title, item.content, item.authorName], query);
      }),
    };
  }

  if (data.board === "intro") {
    return {
      board: "intro",
      // 팀을 찾는 사람이 먼저 보여야 합니다. 이미 팀이 있는 사람은 아래로 내려갑니다.
      items: [...data.items]
        .sort((a, b) => {
          const rank = (status: string) => (status === "LOOKING" ? 0 : status === "TEAMED" ? 1 : 2);
          const gap = rank(a.status) - rank(b.status);
          return gap !== 0 ? gap : b.createdAt.localeCompare(a.createdAt);
        })
        .filter((profile) => {
          if (filter.startsWith("role:") && profile.role !== filter.slice(5)) return false;
          if (["LOOKING", "TEAMED", "DONE"].includes(filter) && profile.status !== filter) return false;
          return matchesQuery([profile.fullName, profile.major, profile.role, profile.bio, ...profile.techStack], query);
        }),
    };
  }

  if (data.board === "recruit") {
    return {
      board: "recruit",
      items: sortRecruitPosts(data.items).filter((post) => {
        if (filter.startsWith("role:") && !post.recruitingRoles.some((role) => role.role === filter.slice(5))) return false;
        if ((filter === "Recruiting" || filter === "Closed") && post.status !== filter) return false;
        return matchesQuery(
          [post.title, post.content, post.authorName, ...post.tags, ...post.recruitingRoles.map((role) => role.role)],
          query,
        );
      }),
    };
  }

  if (data.board === "proposal") {
    return {
      board: "proposal",
      items: sortProposals(data.items).filter((proposal) => {
        if (filter !== "all" && !proposal.categories.includes(filter)) return false;
        return matchesQuery([proposal.title, proposal.content, proposal.companyName, ...proposal.categories], query);
      }),
    };
  }

  if (data.board === "team") {
    return {
      board: "team",
      items: data.items.filter((team) => {
        if (filter !== "all" && team.status !== filter) return false;
        return matchesQuery(
          [team.teamName, team.projectItem, team.leaderName, ...team.members.map((member) => `${member.name} ${member.role}`)],
          query,
        );
      }),
    };
  }

  // 결과물은 필터를 걸지 않아도 기말이 먼저입니다. 최신 성과를 먼저 보여 주는 게시판입니다.
  const byPhase = groupDeliverables(data.items);
  const items = filter === "midterm" || filter === "final" ? byPhase[filter] : [...byPhase.final, ...byPhase.midterm];
  return {
    board: "showcase",
    items: items.filter((item) => matchesQuery([item.title, item.summary, item.teamName, ...item.techStack], query)),
  };
}
