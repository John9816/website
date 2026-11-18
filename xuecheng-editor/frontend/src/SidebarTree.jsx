/**
 * 侧边栏文档树 —— 无限嵌套、可折叠、支持拖拽调整父子关系
 * 文档本身既是页面也是容器（parentId 指向父文档），因此不需要单独的「文件夹」类型。
 *
 * 拖拽交互：
 *  - 拖到某个文档行上 → 成为该文档的子文档（追加到其子节点末尾）
 *  - 拖到底部「移出到根目录」→ 回到根级
 *  - 不能拖到自身或自身的后代之下（防环）
 */
import { useMemo, useState } from "react";
import { buildTreeMenuItems } from "./treeMenu.jsx";

/** 扁平列表 → 嵌套树，同组保持传入顺序 */
export function buildTree(flat) {
  const byParent = new Map();
  flat.forEach((d) => {
    const pid = d.parentId || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(d);
  });
  const make = (doc) => ({
    doc,
    children: (byParent.get(doc.id) || []).map(make),
    hasChildren: (byParent.get(doc.id) || []).length > 0,
  });
  return (byParent.get(null) || []).map(make);
}

/** 统计某节点下的子孙总数（用于删除确认提示） */
export function countDescendants(flat, id) {
  const childrenOf = (pid) => flat.filter((d) => (d.parentId || null) === pid);
  let count = 0;
  const stack = childrenOf(id);
  while (stack.length) {
    const cur = stack.pop();
    count += 1;
    stack.push(...childrenOf(cur.id));
  }
  return count;
}

/** 收集某节点的所有后代 id（用于拖拽防环） */
function collectDescendants(flat, id) {
  const set = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const d of flat) {
      if ((d.parentId || null) === cur && !set.has(d.id)) {
        set.add(d.id);
        stack.push(d.id);
      }
    }
  }
  return set;
}

function TreeNode({ node, depth, currentId, collapsed, onToggle, onOpen, onAdd, onDelete, onTogglePin, onPermission, onRowMenu, dnd, disableDrag }) {
  const { doc, children, hasChildren } = node;
  const isOpen = !collapsed.has(doc.id);
  const isCollapsed = collapsed.has(doc.id);
  const { dragId, overId, canDrop, onDragStart, onDragEnd, onDragOverRow, onDragLeaveRow, onDropOn } = dnd;
  const isOver = overId === doc.id;
  const locked = !!doc.placeholder; // 「受限文档」占位：只用于保持树结构，不可打开/操作

  /* 「⋯」与右键共用同一份定义（与 App.jsx 的全局右键菜单一致） */
  const menuItems = buildTreeMenuItems(doc, {
    onTogglePin,
    onAdd,
    onDelete,
    onPermission,
  });
  const openMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRowMenu(e.clientX, e.clientY, menuItems);
  };

  return (
    <div className="tree-node">
      <div
        className={
          "tree-row" +
          (currentId === doc.id ? " active" : "") +
          (isOver ? " drop-over" : "") +
          (dragId === doc.id ? " dragging" : "")
        }
        style={{ paddingLeft: 8 + depth * 14 }}
        data-doc-id={doc.id}
        onClick={() => !locked && onOpen(doc.id)}
        onContextMenu={locked ? undefined : openMenu}
        draggable={!disableDrag && !locked}
        onDragStart={(e) => onDragStart(e, doc.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOverRow(e, doc.id)}
        onDragLeave={(e) => onDragLeaveRow(e, doc.id)}
        onDrop={(e) => onDropOn(e, doc.id)}
      >
        <button
          className={"tree-arrow" + (hasChildren ? "" : " empty")}
          title={isCollapsed ? "展开" : "折叠"}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(doc.id);
          }}
        >
          {hasChildren ? (isCollapsed ? "▸" : "▾") : ""}
        </button>
        <span className="tree-name" title={doc.title || "未命名文档"}>
          {locked && <span className="tree-lock">🔒</span>}
          {doc.title || "未命名文档"}
        </span>
        <span className="tree-actions">
          {!locked && (
            <button
              className={"tree-more" + (doc.pinned ? " pinned" : "")}
              title="更多操作"
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                onRowMenu(r.left, r.bottom + 4, menuItems);
              }}
            >
              ⋯
            </button>
          )}
        </span>
      </div>
      {hasChildren && isOpen && (
        <div className="tree-children">
          {children.map((c) => (
            <TreeNode
              key={c.doc.id}
              node={c}
              depth={depth + 1}
              currentId={currentId}
              disableDrag={disableDrag}
              collapsed={collapsed}
              onToggle={onToggle}
              onOpen={onOpen}
              onAdd={onAdd}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onPermission={onPermission}
              onRowMenu={onRowMenu}
              dnd={dnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SidebarTree({ docs, currentId, collapsed, onToggle, onOpen, onAdd, onDelete, onMove, onTogglePin, onPermission, onRowMenu, disableDrag = false }) {
  const tree = useMemo(() => buildTree(docs), [docs]);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const canDrop = (drag, target) => {
    if (!drag || !target || drag === target) return false;
    return !collectDescendants(docs, drag).has(target);
  };

  const dnd = {
    dragId,
    overId,
    canDrop,
    onDragStart: (e, id) => {
      setDragId(id);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      } catch (_) {}
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    onDragOverRow: (e, id) => {
      if (!canDrop(dragId, id)) return; // 非法目标不阻止默认行为 → 不显示可放置
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      setOverId(id);
    },
    onDragLeaveRow: (e, id) => {
      e.stopPropagation();
      setOverId((v) => (v === id ? null : v));
    },
    onDropOn: (e, id) => {
      e.preventDefault();
      e.stopPropagation();
      if (canDrop(dragId, id)) onMove(dragId, id);
      setDragId(null);
      setOverId(null);
    },
  };

  if (!docs.length) {
    return <div className="doc-empty">还没有文档</div>;
  }

  const showRootZone = dragId !== null;

  return (
    <div className="doc-tree">
      {tree.map((node) => (
        <TreeNode
          key={node.doc.id}
          node={node}
          depth={0}
          currentId={currentId}
          collapsed={collapsed}
          onToggle={onToggle}
          onOpen={onOpen}
          onAdd={onAdd}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onPermission={onPermission}
          onRowMenu={onRowMenu}
          dnd={dnd}
          disableDrag={disableDrag}
        />
      ))}

      {showRootZone && (
        <div
          className={"tree-rootdrop" + (overId === "__root__" ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            setOverId("__root__");
          }}
          onDragLeave={() => setOverId((v) => (v === "__root__" ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            onMove(dragId, null);
            setDragId(null);
            setOverId(null);
          }}
        >
          移出到根目录
        </div>
      )}
    </div>
  );
}
