"use client";

import { Database, Hotel, Trash2 } from "lucide-react";

export function TeamPanel({
  adminMessage,
  createTeamMember,
  currentUser,
  deactivateTeamMember,
  resendTeamSetupLink,
  setTeamForm,
  setupLinkOrigin,
  teamForm,
  teamMembers,
  teamSetupLink
}) {
  return (
    <div className="inventory-workspace">
      <section className="admin-grid">
        <form className="panel" onSubmit={createTeamMember}>
          <div className="panel-title">
            <Database size={18} />
            <h2>Add Employee</h2>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Email
              <input type="email" value={teamForm.email} onChange={(event) => setTeamForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              Role
              <select value={teamForm.role} onChange={(event) => setTeamForm((current) => ({ ...current, role: event.target.value }))}>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <button className="primary-button" type="submit">Create setup link</button>
          {teamSetupLink && (
            <label>
              Setup link
              <input readOnly value={`${setupLinkOrigin}${teamSetupLink}`} onFocus={(event) => event.target.select()} />
            </label>
          )}
          {adminMessage && <p className="status-line">{adminMessage}</p>}
        </form>

        <div className="panel">
          <div className="panel-title">
            <Hotel size={18} />
            <h2>Employees</h2>
          </div>
          <div className="admin-list">
            {teamMembers.map((member) => (
              <div className="admin-row" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email} · {member.role}{member.hasPendingSetup ? " · setup pending" : ""}</span>
                </div>
                <div className="admin-actions">
                  <button className="secondary-button compact-button" type="button" onClick={() => resendTeamSetupLink(member.id)}>
                    Setup Link
                  </button>
                  {member.id !== currentUser.id && member.isActive && (
                    <button className="danger-button" type="button" onClick={() => deactivateTeamMember(member.id)}>
                      <Trash2 size={16} />
                      Disable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
