"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";
import { installTranslationDomGuard } from "@/lib/domGuard";

// 모든 화면이 이 컴포넌트를 거치므로, 번역 확장이 DOM을 흔들어도 죽지 않도록 여기서 한 번만 막습니다.
// 서버 렌더링 중에는 Node가 없어 그냥 지나갑니다.
if (typeof Node !== "undefined") installTranslationDomGuard(Node.prototype);

/**
 * 워크스페이스와 인증 화면은 자체 헤더를 갖습니다.
 * 공용 푸터는 공개 소개 화면에만 붙여 워크스페이스 안에서 내비게이션이 겹치지 않게 합니다.
 */
const PUBLIC_PAGES = ["/", "/manager/landing", "/workspace-entry", "/calculator", "/library"];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 각 화면이 자기 <main>을 그리므로 여기서는 div로 감쌉니다.
  // main을 중첩하면 문서에 main 랜드마크가 두 개 생겨 스크린리더 탐색이 어긋납니다.
  return (
    <>
      <div className="min-h-screen overflow-x-clip" data-scroll-root>
        {children}
      </div>
      {pathname !== null && PUBLIC_PAGES.includes(pathname) && <Footer />}
    </>
  );
}
