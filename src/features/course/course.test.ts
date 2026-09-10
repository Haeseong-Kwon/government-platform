import { describe, expect, it } from "vitest";
import {
  BOARDS,
  BOARD_ORDER,
  COURSE,
  assignmentFileName,
  toAssignmentCsv,
  MAX_ATTACHMENT_BYTES,
  checkAttachment,
  countOpenRoles,
  courseHref,
  emptyToNull,
  formatBytes,
  getProposalDeadline,
  getStudentProgress,
  getStudentSteps,
  groupDeliverables,
  isBoardId,
  isCourseAccount,
  isCourseEmail,
  isEdited,
  matchesQuery,
  parseRecruitRoles,
  parseTeamMembers,
  rosterFileName,
  semesterColumns,
  sortProposals,
  sortRecruitPosts,
  sortNotices,
  sortQuestions,
  splitTags,
  toRosterCsv,
  toStoragePath,
  validateOptionalUrl,
  validateSignupPassword,
  validateTitleAndBody,
  type CourseNotice,
  type CourseQuestion,
  type CourseTeam,
  type Deliverable,
  type TeamMember,
  type DeliverablePhase,
  type Proposal,
  type RecruitPost,
} from "./course";

const recruit = (over: Partial<RecruitPost>): RecruitPost => ({
  id: "r1",
  authorId: "u1",
  authorName: "김하나",
  title: "제목",
  content: "내용",
  tags: [],
  projectPhase: "IDEA",
  recruitingRoles: [],
  status: "Recruiting",
  createdAt: "2026-08-01T00:00:00Z",
  commentCount: 0,
  ...over,
});

const proposal = (over: Partial<Proposal>): Proposal => ({
  id: "p1",
  createdBy: "u1",
  companyName: "한양테크",
  title: "제목",
  content: "내용",
  categories: [],
  deadline: null,
  contact: "",
  createdAt: "2026-08-01T00:00:00Z",
  commentCount: 0,
  ...over,
});

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  name: "김하나", role: "백엔드", major: "컴퓨터학부", studentId: "2021001", isLeader: false, ...over,
});

const team = (over: Partial<CourseTeam>): CourseTeam => ({
  id: "t1", teamNo: 1, proposalId: null, confirmedAt: "2026-09-01T00:00:00Z", leaderId: "u1", leaderName: "김하나",
  teamName: "오르카랩스", projectItem: "중고거래 앱", members: [member({ isLeader: true })],
  status: "Activities", createdAt: "2026-09-01T00:00:00Z", commentCount: 0, ...over,
});

const deliverable = (over: Partial<Deliverable>): Deliverable => ({
  id: "d1",
  teamId: "t1",
  teamName: "오르카랩스",
  phase: "midterm",
  title: "제목",
  summary: "요약",
  techStack: [],
  demoUrl: null,
  repoUrl: null,
  deckUrl: null,
  videoUrl: null,
  createdBy: "u1",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  commentCount: 0,
  ...over,
});

describe("학기", () => {
  it("모든 글이 같은 학기 컬럼을 달고 저장된다", () => {
    expect(semesterColumns()).toEqual({
      semester_key: COURSE.key,
      academic_year: 2026,
      academic_term: "2",
      course_track: "SW창업캡스톤디자인",
    });
  });

  it("명단 파일 이름에 학기가 들어간다", () => {
    expect(rosterFileName()).toContain("2026-2학기");
    expect(rosterFileName().endsWith(".csv")).toBe(true);
  });

  it("주소의 게시판 값만 통과시킨다", () => {
    expect(isBoardId("qna")).toBe(true);
    expect(isBoardId("notice")).toBe(true);
    expect(isBoardId("intro")).toBe(true);
    expect(isBoardId("recruit")).toBe(true);
    expect(isBoardId("showcase")).toBe(true);
    expect(isBoardId("recruits")).toBe(false);
    expect(isBoardId("__proto__")).toBe(false);
    expect(isBoardId("me")).toBe(false);
  });

  it("이름표가 바뀌어도 주소는 그대로다", () => {
    // 라벨은 학기마다 바뀔 수 있지만 주소가 바뀌면 공유된 링크가 전부 깨집니다.
    expect(courseHref("recruit")).toBe("/course/recruit");
    expect(courseHref("team")).toBe("/course/team");
    expect(BOARDS.recruit.label).toBe("팀원모집");
    expect(BOARDS.team.label).toBe("팀등록");
  });

  it("게시판 순서와 설정이 어긋나지 않는다", () => {
    // 탭·홈 카드·라우트가 전부 BOARD_ORDER를 돌므로, 설정이 빠진 값이 섞이면
    // 화면에서 undefined를 읽습니다.
    expect(BOARD_ORDER).toEqual(["notice", "qna", "intro", "recruit", "team", "proposal", "showcase"]);
    for (const board of BOARD_ORDER) {
      expect(BOARDS[board]?.id).toBe(board);
      expect(BOARDS[board].createLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("가입 가능 메일 도메인", () => {
  it("한양대 메일과 하위 도메인을 받는다", () => {
    expect(isCourseEmail("hana@hanyang.ac.kr")).toBe(true);
    expect(isCourseEmail("hana@office.hanyang.ac.kr")).toBe(true);
    expect(isCourseEmail("hana.kim+capstone@hanyang.ac.kr")).toBe(true);
  });

  it("대소문자와 앞뒤 공백을 가리지 않는다", () => {
    expect(isCourseEmail("HANA@HANYANG.AC.KR")).toBe(true);
    expect(isCourseEmail("  hana@hanyang.ac.kr  ")).toBe(true);
  });

  it("다른 학교·일반 메일은 막는다", () => {
    expect(isCourseEmail("hana@gmail.com")).toBe(false);
    expect(isCourseEmail("hana@snu.ac.kr")).toBe(false);
    expect(isCourseEmail("")).toBe(false);
  });

  it("도메인을 흉내 낸 주소를 막는다", () => {
    // 여기가 이 함수의 존재 이유입니다. "hanyang.ac.kr로 끝나는가"로만 보면 전부 통과합니다.
    expect(isCourseEmail("hana@evil-hanyang.ac.kr")).toBe(false);
    expect(isCourseEmail("hana@myhanyang.ac.kr")).toBe(false);
    expect(isCourseEmail("hana@hanyang.ac.kr.evil.com")).toBe(false);
    expect(isCourseEmail("hana@hanyang-ac.kr")).toBe(false);
  });

  it("@가 여러 개거나 공백이 섞인 값을 막는다", () => {
    expect(isCourseEmail("hana@evil.com@hanyang.ac.kr")).toBe(false);
    expect(isCourseEmail("hana @hanyang.ac.kr")).toBe(false);
    expect(isCourseEmail("hanyang.ac.kr")).toBe(false);
  });
});

describe("과목 계정 표식", () => {
  it("과목 경로로 가입한 계정만 과목으로 보낸다", () => {
    expect(isCourseAccount({ course: COURSE.key })).toBe(true);
    expect(isCourseAccount({ full_name: "김하나" })).toBe(false);
    expect(isCourseAccount({ course: "" })).toBe(false);
    expect(isCourseAccount({ course: "   " })).toBe(false);
    expect(isCourseAccount(null)).toBe(false);
    expect(isCourseAccount(undefined)).toBe(false);
  });

  it("메일 도메인으로 판단하지 않는다", () => {
    // 한양대 메일을 쓰는 창업자가 파일럿에 가입할 수 있습니다.
    // 그 사람을 과목으로 보내면 창업자 쪽이 망가집니다.
    expect(isCourseAccount({ email: "hana@hanyang.ac.kr" })).toBe(false);
  });
});

describe("JSONB 파싱", () => {
  it("객체 배열에서 역할과 인원을 읽는다", () => {
    expect(parseRecruitRoles([{ role: "백엔드", count: 2 }])).toEqual([{ role: "백엔드", count: 2 }]);
  });

  it("예전에 문자열 배열로 저장된 행도 읽는다", () => {
    expect(parseRecruitRoles(["기획"])).toEqual([{ role: "기획", count: 1 }]);
  });

  it("배열이 아니거나 이름이 빈 값은 버린다", () => {
    expect(parseRecruitRoles(null)).toEqual([]);
    expect(parseRecruitRoles("백엔드")).toEqual([]);
    expect(parseRecruitRoles([{ role: "  " }, { count: 3 }, 42])).toEqual([]);
  });

  it("인원이 숫자가 아니거나 0 이하이면 1명으로 본다", () => {
    expect(parseRecruitRoles([{ role: "디자인", count: 0 }, { role: "PM", count: "셋" }])).toEqual([
      { role: "디자인", count: 1 },
      { role: "PM", count: 1 },
    ]);
  });

  it("팀원은 이름이 있어야 명단에 오른다", () => {
    expect(parseTeamMembers([{ name: "박민준", role: "백엔드" }, { role: "이름없음" }, "정서연"])).toEqual([
      { name: "박민준", role: "백엔드", major: "", studentId: "", isLeader: false },
      // 학과·학번이 없던 시절 행도 빈 값으로 채워 화면이 깨지지 않아야 합니다.
      { name: "정서연", role: "", major: "", studentId: "", isLeader: false },
    ]);
  });

  it("모집 인원 합계를 센다", () => {
    expect(countOpenRoles([{ role: "a", count: 2 }, { role: "b", count: 3 }])).toBe(5);
  });
});

describe("태그 입력", () => {
  it("쉼표로 나누고 공백·중복·빈 값을 버린다", () => {
    expect(splitTags(" React , 헬스케어,, React ")).toEqual(["React", "헬스케어"]);
  });
});

describe("목록 정렬", () => {
  it("모집 중인 글이 마감된 글보다 위에 온다", () => {
    const posts = [
      recruit({ id: "closed", status: "Closed", createdAt: "2026-08-10T00:00:00Z" }),
      recruit({ id: "open", status: "Recruiting", createdAt: "2026-08-01T00:00:00Z" }),
    ];
    expect(sortRecruitPosts(posts).map((post) => post.id)).toEqual(["open", "closed"]);
  });

  it("같은 상태면 최신 글이 위에 온다", () => {
    const posts = [
      recruit({ id: "old", createdAt: "2026-08-01T00:00:00Z" }),
      recruit({ id: "new", createdAt: "2026-08-20T00:00:00Z" }),
    ];
    expect(sortRecruitPosts(posts).map((post) => post.id)).toEqual(["new", "old"]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const posts = [recruit({ id: "closed", status: "Closed" }), recruit({ id: "open" })];
    sortRecruitPosts(posts);
    expect(posts.map((post) => post.id)).toEqual(["closed", "open"]);
  });

  it("마감이 임박한 제안이 위로, 지난 제안이 맨 아래로 간다", () => {
    const now = new Date("2026-08-31T00:00:00Z");
    const proposals = [
      proposal({ id: "expired", deadline: "2026-08-01" }),
      proposal({ id: "none", deadline: null }),
      proposal({ id: "soon", deadline: "2026-09-02" }),
      proposal({ id: "later", deadline: "2026-10-01" }),
    ];
    expect(sortProposals(proposals, now).map((item) => item.id)).toEqual(["soon", "later", "none", "expired"]);
  });
});

describe("팀 명단 파일", () => {
  it("요청받은 열 순서를 지킨다", () => {
    const [header] = toRosterCsv([team({})]).split("\r\n");
    expect(header).toBe('"팀번호","팀명","팀원이름","역할","학과","학번","비고"');
  });

  it("팀원 한 명이 한 줄이고 팀장이 비고에 표시된다", () => {
    const rows = toRosterCsv([team({ members: [member({ isLeader: true }), member({ name: "박민준" })] })]).split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe('"1","오르카랩스","김하나","백엔드","컴퓨터학부","2021001","팀장"');
    expect(rows[2]).toContain('"박민준"');
    expect(rows[2].endsWith('"팀원"')).toBe(true);
  });

  it("팀번호 순으로 정렬한다", () => {
    const csv = toRosterCsv([team({ id: "b", teamNo: 2, teamName: "나중" }), team({ id: "a", teamNo: 1, teamName: "먼저" })]);
    expect(csv.indexOf("먼저")).toBeLessThan(csv.indexOf("나중"));
  });

  it("쉼표·따옴표가 든 값이 열을 밀지 않는다", () => {
    const csv = toRosterCsv([team({ teamName: '오르카, "랩스"' })]);
    expect(csv).toContain('"오르카, ""랩스"""');
  });

  it("팀원이 없어도 팀 줄은 남는다", () => {
    // 빈 팀이 통째로 사라지면 누락을 알아챌 방법이 없습니다.
    const rows = toRosterCsv([team({ members: [] })]).split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"오르카랩스"');
  });
});

describe("기업 제안 배정 파일", () => {
  it("제안 한 건 + 팀 한 팀이 한 줄이다", () => {
    const rows = toAssignmentCsv(
      [proposal({ id: "p1", companyName: "한양테크", title: "재고 예측", deadline: "2026-10-01" })],
      [team({ id: "t1", teamNo: 3, proposalId: "p1", members: [member({ isLeader: true }), member({ name: "박민준" })] })],
    ).split("\r\n");

    expect(rows[0]).toBe('"기업명","제안제목","지원마감","팀번호","팀명","프로젝트아이템","팀장","팀원수","팀원"');
    expect(rows[1]).toBe('"한양테크","재고 예측","2026-10-01","3","오르카랩스","중고거래 앱","김하나","2","김하나, 박민준"');
  });

  it("팀이 배정되지 않은 제안도 줄을 남긴다", () => {
    const rows = toAssignmentCsv([proposal({ id: "p1" })], []).split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"(배정된 팀 없음)"');
  });

  it("어느 제안에도 붙지 않은 팀을 뒤에 모은다", () => {
    const rows = toAssignmentCsv(
      [proposal({ id: "p1" })],
      [team({ id: "t1", proposalId: "p1" }), team({ id: "t2", teamNo: 2, teamName: "미배정팀", proposalId: null })],
    ).split("\r\n");

    expect(rows.at(-1)).toContain('"미배정팀"');
    expect(rows.at(-1)?.startsWith('"(미배정 팀)"')).toBe(true);
  });

  it("지워진 제안에 붙어 있던 팀도 미배정으로 본다", () => {
    // 제안이 지워지면 배정만 풀리지만(028), 화면이 그 사이 목록을 들고 있을 수 있습니다.
    const rows = toAssignmentCsv([proposal({ id: "p1" })], [team({ id: "t1", proposalId: "사라진제안" })]).split("\r\n");
    expect(rows.at(-1)?.startsWith('"(미배정 팀)"')).toBe(true);
  });

  it("한 제안에 배정된 팀은 팀번호 순이다", () => {
    const csv = toAssignmentCsv(
      [proposal({ id: "p1" })],
      [
        team({ id: "b", teamNo: 2, teamName: "나중", proposalId: "p1" }),
        team({ id: "a", teamNo: 1, teamName: "먼저", proposalId: "p1" }),
      ],
    );
    expect(csv.indexOf("먼저")).toBeLessThan(csv.indexOf("나중"));
  });

  it("원본 배열을 건드리지 않는다", () => {
    const teams = [team({ id: "b", teamNo: 2, proposalId: "p1" }), team({ id: "a", teamNo: 1, proposalId: "p1" })];
    toAssignmentCsv([proposal({ id: "p1" })], teams);
    expect(teams.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("파일 이름이 학기와 과목을 담고 csv로 끝난다", () => {
    expect(assignmentFileName()).toBe(`${COURSE.year}-${COURSE.term}학기_${COURSE.track}_기업제안_팀배정.csv`);
  });
});

describe("Q&A 정렬", () => {
  const q = (over: Partial<CourseQuestion>): CourseQuestion => ({
    id: "q1", title: "제목", content: "내용", answeredAt: null, authorId: "u1",
    authorName: "김하나", createdAt: "2026-09-01T00:00:00Z", commentCount: 0, ...over,
  });

  it("답변 없는 질문이 먼저 — 물어본 사람이 기다리고 있다", () => {
    const rows = [
      q({ id: "answered", answeredAt: "2026-09-20T00:00:00Z", createdAt: "2026-09-20T00:00:00Z" }),
      q({ id: "open", createdAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortQuestions(rows).map((r) => r.id)).toEqual(["open", "answered"]);
  });

  it("같은 상태면 최신순", () => {
    const rows = [q({ id: "old", createdAt: "2026-09-01T00:00:00Z" }), q({ id: "new", createdAt: "2026-09-20T00:00:00Z" })];
    expect(sortQuestions(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("공지 정렬", () => {
  const notice = (over: Partial<CourseNotice>): CourseNotice => ({
    id: "n1", title: "제목", content: "내용", isPinned: false,
    createdBy: "u1", authorName: "교수", createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z", commentCount: 0, ...over,
  });

  it("고정 공지가 최신 공지보다 위에 온다", () => {
    const rows = [
      notice({ id: "new", createdAt: "2026-09-20T00:00:00Z" }),
      notice({ id: "pinned", isPinned: true, createdAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortNotices(rows).map((r) => r.id)).toEqual(["pinned", "new"]);
  });

  it("고정끼리는 최신순", () => {
    const rows = [
      notice({ id: "old", isPinned: true, createdAt: "2026-09-01T00:00:00Z" }),
      notice({ id: "new", isPinned: true, createdAt: "2026-09-20T00:00:00Z" }),
    ];
    expect(sortNotices(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [notice({ id: "a" }), notice({ id: "b", isPinned: true })];
    sortNotices(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("제안 마감", () => {
  const now = new Date("2026-08-31T00:00:00Z");

  it("마감일이 없으면 표시하지 않는다", () => {
    expect(getProposalDeadline(null, now)).toBeNull();
  });

  it("오늘 마감은 D-0이 아니라 '오늘 마감'으로 읽힌다", () => {
    expect(getProposalDeadline("2026-08-31", now)).toMatchObject({ dday: 0, label: "오늘 마감", expired: false });
  });

  it("사흘 안쪽은 빨강, 일주일 안쪽은 주황", () => {
    expect(getProposalDeadline("2026-09-02", now)?.tone).toBe("red");
    expect(getProposalDeadline("2026-09-06", now)?.tone).toBe("amber");
    expect(getProposalDeadline("2026-09-30", now)?.tone).toBe("blue");
  });

  it("지난 마감은 남은 일수 대신 '마감'으로 끝낸다", () => {
    expect(getProposalDeadline("2026-08-30", now)).toMatchObject({ label: "마감", expired: true });
  });
});

describe("결과물", () => {
  it("중간과 기말을 갈라 각각 최신 수정순으로 둔다", () => {
    const grouped = groupDeliverables([
      deliverable({ id: "m1", phase: "midterm", updatedAt: "2026-09-01T00:00:00Z" }),
      deliverable({ id: "f1", phase: "final", updatedAt: "2026-12-01T00:00:00Z" }),
      deliverable({ id: "m2", phase: "midterm", updatedAt: "2026-10-01T00:00:00Z" }),
    ]);
    expect(grouped.midterm.map((item) => item.id)).toEqual(["m2", "m1"]);
    expect(grouped.final.map((item) => item.id)).toEqual(["f1"]);
  });

  it("한쪽 단계가 비어도 빈 배열로 답한다", () => {
    expect(groupDeliverables([])).toEqual({ midterm: [], final: [] });
  });
});

describe("댓글 수정 표시", () => {
  it("저장 지연 정도의 차이는 수정으로 보지 않는다", () => {
    // 두 시각이 밀리초 단위로 어긋나는 것은 정상입니다. 이걸 수정으로 보면
    // 방금 쓴 댓글에도 "수정됨"이 붙습니다.
    expect(isEdited("2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.400Z")).toBe(false);
    expect(isEdited("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(false);
  });

  it("실제로 고친 댓글은 수정으로 본다", () => {
    expect(isEdited("2026-09-01T00:00:00Z", "2026-09-01T00:05:00Z")).toBe(true);
  });

  it("시각을 못 읽으면 표시하지 않는다", () => {
    expect(isEdited("이상한값", "2026-09-01T00:05:00Z")).toBe(false);
  });
});

describe("검색", () => {
  it("제목에 없어도 역할이나 태그에서 걸린다", () => {
    expect(matchesQuery(["캠퍼스 앱", "백엔드", "React"], "백엔드")).toBe(true);
  });

  it("대소문자를 가리지 않는다", () => {
    expect(matchesQuery(["Next.js"], "next")).toBe(true);
  });

  it("검색어가 비면 전부 통과한다", () => {
    expect(matchesQuery(["아무거나"], "   ")).toBe(true);
  });

  it("빈 값이 섞여 있어도 터지지 않는다", () => {
    expect(matchesQuery([null, undefined, "백엔드"], "백엔드")).toBe(true);
  });
});

describe("수강생 진행 단계", () => {
  const base = { hasProfile: false, recruitPostCount: 0, teamCount: 0, deliverablePhases: [] as DeliverablePhase[] };
  const idsDone = (input: Parameters<typeof getStudentSteps>[0]) =>
    getStudentSteps(input).filter((step) => step.done).map((step) => step.id);

  it("아무것도 안 했으면 전부 미완이고 다음 할 일은 자기소개다", () => {
    const steps = getStudentSteps(base);
    expect(idsDone(base)).toEqual([]);
    expect(getStudentProgress(steps)).toMatchObject({ done: 0, total: 5, percent: 0 });
    expect(getStudentProgress(steps).next?.id).toBe("profile");
  });

  it("모집글을 올리면 팀 찾기가 끝난 것으로 본다", () => {
    expect(idsDone({ ...base, recruitPostCount: 1 })).toEqual(["recruit"]);
  });

  it("모집글 없이 팀만 등록해도 팀 찾기를 미완으로 남기지 않는다", () => {
    // 오프라인에서 팀을 짠 경우입니다. 지나온 단계를 미완으로 두면 목록이 잔소리가 됩니다.
    expect(idsDone({ ...base, teamCount: 1 })).toEqual(["recruit", "team"]);
  });

  it("중간만 냈으면 기말은 미완으로 남는다", () => {
    const input = { ...base, hasProfile: true, teamCount: 1, deliverablePhases: ["midterm"] as DeliverablePhase[] };
    expect(idsDone(input)).toEqual(["profile", "recruit", "team", "midterm"]);
    expect(getStudentProgress(getStudentSteps(input)).next?.id).toBe("final");
  });

  it("다 끝나면 100%이고 다음 할 일이 없다", () => {
    const input = {
      hasProfile: true,
      recruitPostCount: 2,
      teamCount: 1,
      deliverablePhases: ["midterm", "final"] as DeliverablePhase[],
    };
    const progress = getStudentProgress(getStudentSteps(input));
    expect(progress).toMatchObject({ done: 5, total: 5, percent: 100 });
    expect(progress.next).toBeNull();
  });

  it("각 단계는 갈 곳을 갖는다 — 안내만 하고 길이 없으면 소용없다", () => {
    for (const step of getStudentSteps(base)) {
      expect(step.href.startsWith("/course")).toBe(true);
      expect(step.cta.length).toBeGreaterThan(0);
    }
  });

  it("자기소개 단계는 자기소개 게시판을 가리킨다", () => {
    const profileStep = getStudentSteps(base).find((step) => step.id === "profile");
    expect(profileStep?.href).toBe("/course/intro");
  });
});

describe("첨부파일", () => {
  it("문서·이미지·압축 파일을 받는다", () => {
    expect(checkAttachment({ name: "과업지시서.pdf", size: 1024 })).toBeNull();
    expect(checkAttachment({ name: "명세.HWP", size: 2048 })).toBeNull();
    expect(checkAttachment({ name: "도면.zip", size: 4096 })).toBeNull();
  });

  it("실행 파일은 막는다", () => {
    expect(checkAttachment({ name: "setup.exe", size: 1024 })).toContain("형식");
    expect(checkAttachment({ name: "run.sh", size: 1024 })).toContain("형식");
    expect(checkAttachment({ name: "확장자없음", size: 1024 })).toContain("형식");
    // 점이 없으면 이름 전체가 확장자로 읽힐 뻔했습니다 — 이 파일은 PDF가 아닙니다.
    expect(checkAttachment({ name: "pdf", size: 1024 })).toContain("형식");
    expect(checkAttachment({ name: ".hwp", size: 1024 })).toContain("형식");
  });

  it("용량 한도와 빈 파일을 막는다", () => {
    expect(checkAttachment({ name: "big.pdf", size: MAX_ATTACHMENT_BYTES + 1 })).toContain("너무 큽니다");
    expect(checkAttachment({ name: "ok.pdf", size: MAX_ATTACHMENT_BYTES })).toBeNull();
    expect(checkAttachment({ name: "empty.pdf", size: 0 })).toContain("빈 파일");
  });

  it("스토리지 경로에 한글·공백을 남기지 않는다", () => {
    // 원래 파일명을 그대로 쓰면 URL이 깨집니다. 보여 줄 이름은 DB에 따로 둡니다.
    const path = toStoragePath("proposals", "p1", "과업 지시서 (최종).pdf", "abc123");
    expect(path).toBe("proposals/p1/abc123.pdf");
    expect(/^[\x20-\x7e]+$/.test(path)).toBe(true);
  });

  it("확장자가 없어도 경로를 만든다", () => {
    expect(toStoragePath("proposals", "p1", "README", "abc123")).toBe("proposals/p1/abc123");
    // 안내 첨부는 다른 폴더로 갑니다 — 같은 버킷에서 주인이 섞이지 않게.
    expect(toStoragePath("guides", "g1", "양식.hwp", "xyz")).toBe("guides/g1/xyz.hwp");
  });

  it("사람이 읽는 크기로 바꾼다", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0MB");
  });
});

describe("입력 검증", () => {
  it("제목과 내용이 짧으면 저장 전에 막는다", () => {
    expect(validateTitleAndBody("가", "충분히 긴 내용입니다")).toContain("제목");
    expect(validateTitleAndBody("괜찮은 제목", "짧음")).toContain("내용");
    expect(validateTitleAndBody("괜찮은 제목", "열 자가 넘는 본문입니다")).toBeNull();
  });

  it("공백만 있는 입력은 빈 입력으로 본다", () => {
    expect(validateTitleAndBody("   ", "열 자가 넘는 본문입니다")).toContain("제목");
  });

  it("링크는 비워 둘 수 있지만 적었다면 http/https여야 한다", () => {
    expect(validateOptionalUrl("", "저장소")).toBeNull();
    expect(validateOptionalUrl("https://github.com/team/repo", "저장소")).toBeNull();
    expect(validateOptionalUrl("github.com/team/repo", "저장소")).toContain("저장소");
    expect(validateOptionalUrl("javascript:alert(1)", "저장소")).toContain("http/https");
  });

  it("가입 비밀번호는 길이와 일치를 함께 본다", () => {
    expect(validateSignupPassword("abcdef", "abcdef")).toBeNull();
    expect(validateSignupPassword("abc", "abc")).toContain("6자 이상");
    expect(validateSignupPassword("abcdef", "abcdeF")).toContain("서로 다릅니다");
    expect(validateSignupPassword("abcdef", "")).toContain("서로 다릅니다");
  });

  it("공백만으로는 비밀번호를 만들 수 없다", () => {
    // Supabase는 받아 주지만 사람은 다시 입력하지 못합니다.
    expect(validateSignupPassword("      ", "      ")).toContain("공백 외의 문자");
  });

  it("빈 링크 칸은 빈 문자열이 아니라 null로 저장된다", () => {
    expect(emptyToNull("  ")).toBeNull();
    expect(emptyToNull(" https://a.b ")).toBe("https://a.b");
  });
});
