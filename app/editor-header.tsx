"use client";

import AccountDropdown from "./account-dropdown";
import "./editor-header.css";

type EditorUser = { email: string; firstName: string; lastName: string; role: "user" | "admin" };
export default function EditorHeader({ user, projectName, onHome, onProjectMenu, onLogin, sectionName='Гостиная' }: { user: EditorUser | null; projectName: string; onHome: () => void; onProjectMenu: () => void; onLogin: () => void; sectionName?:string }) {
  return <header className="topbar editor-header"><button className="wordmark room-design-wordmark" type="button" onClick={onHome} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><div className="crumb"><button type="button" onClick={onProjectMenu}>← Меню проекта</button><i>›</i><b>{projectName || "Новый проект"}</b><i>›</i><span>{sectionName}</span></div><div className="top-actions">{user ? <AccountDropdown user={user}/> : <button type="button" className="editor-header-login" onClick={onLogin}>Войти</button>}</div></header>;
}
