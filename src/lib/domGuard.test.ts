import { describe, expect, it } from "vitest";
import { installTranslationDomGuard } from "./domGuard";

type FakeNode = { parentNode: FakeNode | null; children: FakeNode[] };
type FakeHost = FakeNode & {
  removeChild(child: FakeNode): FakeNode;
  insertBefore(node: FakeNode, reference: FakeNode | null): FakeNode;
};

/** 실제 DOM처럼 부모가 어긋나면 던지는, 최소한의 가짜 노드입니다. */
function createParent(): FakeHost {
  const host = {
    removeChild(this: FakeHost, child: FakeNode) {
      if (child.parentNode !== this) throw new Error("Failed to execute 'removeChild' on 'Node'");
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      return child;
    },
    insertBefore(this: FakeHost, node: FakeNode, reference: FakeNode | null) {
      if (reference && reference.parentNode !== this) throw new Error("Failed to execute 'insertBefore' on 'Node'");
      const at = reference ? this.children.indexOf(reference) : this.children.length;
      this.children.splice(at, 0, node);
      node.parentNode = this;
      return node;
    },
  };
  installTranslationDomGuard(host as unknown as Node);

  const parent = Object.create(host) as FakeHost;
  parent.parentNode = null;
  parent.children = [];
  return parent;
}

function attach(parent: FakeHost): FakeNode {
  const node: FakeNode = { parentNode: parent, children: [] };
  parent.children.push(node);
  return node;
}

/** 번역 확장이 노드를 <font> 밑으로 가져간 상황을 흉내 냅니다. */
function stealByTranslator(node: FakeNode): void {
  node.parentNode = { parentNode: null, children: [node] };
}

describe("installTranslationDomGuard", () => {
  it("번역 확장이 옮겨 간 노드를 지워도 던지지 않는다", () => {
    const parent = createParent();
    const child = attach(parent);
    stealByTranslator(child);

    expect(() => parent.removeChild(child)).not.toThrow();
  });

  it("정상적인 자식은 그대로 지운다", () => {
    const parent = createParent();
    const child = attach(parent);

    parent.removeChild(child);

    expect(parent.children).toEqual([]);
  });

  it("기준 노드가 사라졌으면 끝에 붙여 화면을 살린다", () => {
    const parent = createParent();
    const kept = attach(parent);
    const moved = attach(parent);
    stealByTranslator(moved);
    const added: FakeNode = { parentNode: null, children: [] };

    parent.insertBefore(added, moved);

    expect(parent.children.at(-1)).toBe(added);
    expect(parent.children).toContain(kept);
  });
});
