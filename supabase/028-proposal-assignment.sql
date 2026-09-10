-- 기업 제안 ↔ 팀 배정. 027 다음에 실행합니다.
--
-- 재실행해도 안전합니다.

-- ---------------------------------------------------------------- 1) 배정 열

/*
 * 한 팀은 한 프로젝트를 합니다. 그래서 배정을 별도 표가 아니라 팀 행의 열로 둡니다.
 * 표를 따로 두면 "한 팀이 두 제안에 붙은" 상태가 표현 가능해지고, 명단을 뽑을 때마다
 * 그 모순을 화면에서 걸러 내야 합니다.
 *
 * 제안이 지워지면 배정만 풀립니다(팀은 남습니다). 제안 글 하나를 지웠다고
 * 팀 등록이 함께 사라지면 결과물과 명단이 통째로 날아갑니다.
 */
ALTER TABLE team_registrations
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES corporate_proposals(id) ON DELETE SET NULL;

-- 이 열을 읽는 유일한 질문이 "이 제안에 배정된 팀"입니다.
CREATE INDEX IF NOT EXISTS team_registrations_proposal_idx
  ON team_registrations (proposal_id) WHERE proposal_id IS NOT NULL;

-- ---------------------------------------------------------------- 2) 배정 권한

/*
 * 배정은 운영진의 결정입니다.
 *
 * RLS는 행 단위라 "이 열만 운영진"을 막지 못합니다. 미확정 팀의 팀장은 자기 팀 행을
 * 고칠 수 있으므로(026), 열만 추가하면 학생이 개발자 도구로 자기 팀을 원하는 기업
 * 제안에 붙일 수 있습니다. 값이 바뀌는 순간을 트리거로 막습니다.
 *
 * is_course_staff()가 SECURITY DEFINER라 이 함수는 그럴 필요가 없습니다.
 */
CREATE OR REPLACE FUNCTION guard_proposal_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proposal_id IS NOT NULL AND NOT is_course_staff() THEN
      RAISE EXCEPTION 'FORBIDDEN' USING HINT = '기업 제안 배정은 과목 운영진만 할 수 있습니다.';
    END IF;
    RETURN NEW;
  END IF;

  -- 팀장이 팀 이름·팀원을 고치는 보통의 수정은 이 값을 건드리지 않아 그대로 통과합니다.
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id AND NOT is_course_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING HINT = '기업 제안 배정은 과목 운영진만 할 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_registrations_guard_proposal ON team_registrations;
CREATE TRIGGER team_registrations_guard_proposal
  BEFORE INSERT OR UPDATE ON team_registrations
  FOR EACH ROW EXECUTE FUNCTION guard_proposal_assignment();
