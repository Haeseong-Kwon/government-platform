/**
 * 크롬 자동 번역 같은 브라우저 번역 확장은 화면의 글자 노드를 <font>로 감싸 다른 자리로 옮깁니다.
 * 그 뒤 React가 원래 자리의 노드를 지우거나 그 앞에 무언가를 끼우려 하면 부모가 이미 바뀌어 있어
 * "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."로
 * 화면 전체가 죽습니다. 한국어 화면을 번역해 보는 유학생에게 실제로 일어난 오류입니다.
 *
 * 확장 프로그램은 우리가 못 고치므로 DOM 쪽에서 한 번 막습니다.
 * 남의 손이 노드를 옮겨 부모가 어긋난 경우만 조용히 넘기고, 그 밖의 오류는 그대로 터뜨려
 * 진짜 버그를 감추지 않습니다.
 */
export function installTranslationDomGuard(proto: Node): void {
  const originalRemoveChild = proto.removeChild;
  const originalInsertBefore = proto.insertBefore;

  proto.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    // 이미 남이 떼어 간 노드입니다. 지우려던 목적은 달성된 상태라 그대로 돌려줍니다.
    if (child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  proto.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    // 기준 노드가 사라졌으면 자리 지정을 포기하고 끝에 붙입니다. 순서는 어긋나도 화면은 삽니다.
    if (reference && reference.parentNode !== this) return originalInsertBefore.call(this, node, null) as T;
    return originalInsertBefore.call(this, node, reference) as T;
  };
}
