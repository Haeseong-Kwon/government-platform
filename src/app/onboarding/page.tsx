"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/services/AuthService";
import { completeOnboarding } from "@/lib/services/WorkspaceService";
import { createTeamInvite, type TeamInvite } from "@/lib/services/FounderWorkspaceService";
import { STARTUP_PROGRAMS } from "@/features/startup-workspace/rules";
import { Button, ChoiceChip, Field, Notice, StatusBadge, inputClass } from "@/features/startup-workspace/ui";
import { cn } from "@/lib/utils";
import { toMessage } from "@/lib/errors";

const STEPS = [
  { title: "대표자 정보", hint: "누가 팀을 이끄는지 확인합니다." },
  { title: "지원사업 선택", hint: "선택한 공고의 마감일로 준비 일정을 역산합니다." },
  { title: "아이템 소개", hint: "자격 진단과 계획서 진단의 기준이 됩니다." },
  { title: "팀원 초대", hint: "초대 링크로 합류하면 진단 무료 횟수가 늘어납니다." },
] as const;

const emptyForm = {
  fullName: "",
  position: "대표",
  teamName: "",
  itemSummary: "",
  industry: "",
  programIds: [] as string[],
  teamBuildingIntent: false,
  desiredPositions: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [destination, setDestination] = useState("/founder");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        if (!user) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => { if (mounted) setChecking(false); });
    return () => { mounted = false; };
  }, [router]);

  const patch = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));

  const toggleProgram = (programId: string) =>
    setForm((current) => ({
      ...current,
      programIds: current.programIds.includes(programId)
        ? current.programIds.filter((id) => id !== programId)
        : [...current.programIds, programId],
    }));

  const stepValid =
    step === 0 ? Boolean(form.fullName.trim() && form.teamName.trim())
    : step === 1 ? true
    : step === 2 ? Boolean(form.itemSummary.trim())
    : true;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await completeOnboarding({
        ...form,
        fullName: form.fullName.trim(),
        teamName: form.teamName.trim(),
        itemSummary: form.itemSummary.trim(),
        desiredPositions: form.desiredPositions.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setDestination(result.redirect);
      // 팀이 만들어진 뒤에야 초대 코드를 만들 수 있어 저장 다음 단계에 둡니다.
      // 초대 링크 생성이 실패해도 온보딩은 이미 끝났으므로 진행을 막지 않습니다.
      setInvite(await createTeamInvite().catch(() => null));
      setStep(3);
    } catch (reason) {
      setError(toMessage(reason, "온보딩을 완료하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = invite && typeof window !== "undefined" ? `${window.location.origin}/signup?invite=${invite.code}` : null;

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.");
    }
  };

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8FAFC]">
        <Loader2 className="animate-spin text-[#2563EB]" size={28} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-5 py-10 text-[#0F172A]">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-xl font-bold">StartUp Pilot</Link>

        <ol className="mt-6 flex gap-2">
          {STEPS.map((item, index) => (
            <li key={item.title} className="flex-1">
              <div className={cn("h-1.5 rounded-full", index <= step ? "bg-[#2563EB]" : "bg-[#E2E8F0]")} />
              <p className={cn("mt-2 text-xs font-bold", index <= step ? "text-[#2563EB]" : "text-[#94A3B8]")}>
                {/* 번호와 체크 아이콘이 자리를 맞바꾸는 지점입니다. 번역 확장이 이 글자를 가져가면
                    React가 지울 노드를 못 찾아 화면이 죽어, 번역 대상에서 빼고 자체 칸에 둡니다. */}
                <span translate="no" className="mr-1">
                  {index < step ? <Check size={12} className="inline" /> : `${index + 1}.`}
                </span>
                {item.title}
              </p>
            </li>
          ))}
        </ol>

        <section className="mt-5 rounded-3xl border border-[#E2E8F0] bg-white p-6 md:p-9">
          <h1 className="text-[26px] font-bold md:text-[30px]">{STEPS[step].title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#475569]">{STEPS[step].hint}</p>

          {step === 0 && (
            <div className="mt-7 grid gap-4">
              <Field label="이름"><input value={form.fullName} onChange={(event) => patch({ fullName: event.target.value })} placeholder="홍길동" className={inputClass} /></Field>
              <Field label="현재 포지션"><input value={form.position} onChange={(event) => patch({ position: event.target.value })} placeholder="대표 / 기획 / 개발" className={inputClass} /></Field>
              <Field label="팀 이름" hint="워크스페이스와 초대 코드에 표시됩니다."><input value={form.teamName} onChange={(event) => patch({ teamName: event.target.value })} placeholder="예: 성장하는 팀" className={inputClass} /></Field>
            </div>
          )}

          {step === 1 && (
            <div className="mt-7 space-y-4">
              <p className="text-sm text-[#64748B]">선택하지 않아도 시작할 수 있고, 나중에 캘린더에서 추가할 수 있습니다.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {STARTUP_PROGRAMS.map((program) => {
                  const selected = form.programIds.includes(program.id);
                  return (
                    <ChoiceChip
                      key={program.id}
                      selected={selected}
                      onClick={() => toggleProgram(program.id)}
                      className="rounded-2xl p-4 text-left"
                    >
                      {program.name}
                      <span className="mt-2 block text-xs font-semibold text-[#94A3B8]">
                        {program.requiresNoBusinessRegistration ? "사업자등록 없어야 함" : "사업자등록 무관"}
                      </span>
                    </ChoiceChip>
                  );
                })}
              </div>
              <p className="rounded-xl bg-[#F8FAFC] p-4 text-sm leading-6 text-[#475569]">
                선택한 사업의 공고 마감일을 기준으로 초안·증빙·리허설·제출 마일스톤이 자동 생성됩니다.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="mt-7 grid gap-4">
              <Field label="아이템 한 줄 소개"><input value={form.itemSummary} onChange={(event) => patch({ itemSummary: event.target.value })} placeholder="예: 소상공인을 위한 재고 예측 서비스" className={inputClass} /></Field>
              <Field label="업종"><input value={form.industry} onChange={(event) => patch({ industry: event.target.value })} placeholder="예: SaaS, 교육, 제조" className={inputClass} /></Field>
              <label className="flex items-center gap-3 rounded-2xl bg-[#F8FAFC] p-4 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4" checked={form.teamBuildingIntent} onChange={(event) => patch({ teamBuildingIntent: event.target.checked })} />
                함께할 팀원을 찾고 있어요
              </label>
              {form.teamBuildingIntent && (
                <Field label="찾는 포지션" hint="쉼표로 구분해 주세요."><input value={form.desiredPositions} onChange={(event) => patch({ desiredPositions: event.target.value })} placeholder="개발, 디자인" className={inputClass} /></Field>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="mt-7 space-y-4">
              <Notice tone="success">팀 설정을 저장했습니다. 선택한 사업의 마감 기준 할 일이 생성되었습니다.</Notice>
              <p className="text-sm leading-6 text-[#475569]">
                아래 링크를 팀원에게 보내면 같은 워크스페이스로 합류합니다.
                합류할 때마다 사업계획서 AI 진단 무료 횟수가 1회씩 늘어납니다.
              </p>
              {inviteUrl ? (
                <div className="rounded-2xl border border-[#E2E8F0] p-4">
                  <p className="break-all font-mono text-sm text-[#2563EB]">{inviteUrl}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void copyInvite()}>링크 복사</Button>
                    {copied && <StatusBadge tone="green">복사했습니다</StatusBadge>}
                    <span className="text-xs text-[#94A3B8]">최대 {invite?.maxUses ?? 5}명 · {invite?.expiresAt.slice(0, 10)}까지</span>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-[#FFFBEB] p-4 text-sm font-semibold text-[#B45309]">
                  초대 링크를 만들지 못했습니다. 팀 설정 화면에서 다시 발급할 수 있습니다.
                </p>
              )}
            </div>
          )}

          {error && <div className="mt-5"><Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice></div>}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="secondary" size="lg" disabled={step === 0 || step === 3 || loading} onClick={() => setStep((current) => current - 1)}>
              이전
            </Button>
            {!stepValid && <StatusBadge tone="amber">필수 항목을 입력해 주세요</StatusBadge>}
            {step < 2 ? (
              <Button size="lg" disabled={!stepValid} onClick={() => setStep((current) => current + 1)}>다음</Button>
            ) : step === 2 ? (
              <Button size="lg" loading={loading} disabled={!stepValid} onClick={() => void submit()}>설정 완료</Button>
            ) : (
              <Button size="lg" onClick={() => router.replace(destination)}>워크스페이스로 이동</Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
