/**
 * 文档树行的统一菜单定义。
 * 历史上 App.jsx 与 SidebarTree.jsx 各写了一份（项数与图标都不一致），
 * 新增权限后必须同步，故抽成唯一真相：两处都调用 buildTreeMenuItems。
 */
import { PushpinOutlined, PlusOutlined, CloseOutlined, TeamOutlined } from "@ant-design/icons";

export function buildTreeMenuItems(doc, handlers = {}) {
  if (!doc || doc.placeholder) return [];
  const { onTogglePin, onAdd, onDelete, onPermission } = handlers;
  const items = [
    {
      label: doc.pinned ? "取消固定（移出快速访问）" : "固定到快速访问",
      icon: <PushpinOutlined />,
      onClick: () => onTogglePin?.(doc.id),
    },
  ];
  if (doc.canEdit) {
    items.push({ label: "新建子文档", icon: <PlusOutlined />, onClick: () => onAdd?.(doc.id) });
  }
  if (doc.canManage) {
    items.push({ label: "权限与成员", icon: <TeamOutlined />, onClick: () => onPermission?.(doc.id) });
    items.push({ sep: true });
    items.push({ label: "删除", icon: <CloseOutlined />, danger: true, onClick: () => onDelete?.(doc.id) });
  }
  return items;
}
