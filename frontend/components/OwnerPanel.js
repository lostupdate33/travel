"use client";

import { Database, Hotel, Layers, MapPin } from "lucide-react";

export function OwnerPanel({
  adminMessage,
  createOwnerTenant,
  createOwnerTenantAdmin,
  loadOwnerTenantTemplates,
  onboardOwnerTemplates,
  ownerAdminForm,
  ownerSetupLink,
  ownerTenantTemplates,
  ownerTenantForm,
  ownerTenants,
  setOwnerAdminForm,
  setOwnerTenantForm,
  setupLinkOrigin,
  toggleOwnerTenantTemplate
}) {
  return (
    <div className="inventory-workspace">
      <section className="panel">
        <div className="panel-title">
          <Layers size={18} />
          <h2>Proposal Templates</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onboardOwnerTemplates}>Onboard templates</button>
      </section>

      <section className="admin-grid">
        <form className="panel" onSubmit={createOwnerTenant}>
          <div className="panel-title">
            <Database size={18} />
            <h2>Create Tenant</h2>
          </div>
          <div className="form-grid">
            <label>
              Tenant slug
              <input value={ownerTenantForm.slug} onChange={(event) => setOwnerTenantForm((current) => ({ ...current, slug: event.target.value }))} />
            </label>
            <label>
              Tenant name
              <input value={ownerTenantForm.name} onChange={(event) => setOwnerTenantForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Email
              <input value={ownerTenantForm.email} onChange={(event) => setOwnerTenantForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              Phone
              <input value={ownerTenantForm.phone} onChange={(event) => setOwnerTenantForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
          </div>
          <button className="primary-button" type="submit">Save tenant</button>
        </form>

        <form className="panel" onSubmit={createOwnerTenantAdmin}>
          <div className="panel-title">
            <Hotel size={18} />
            <h2>Create Tenant Admin</h2>
          </div>
          <div className="form-grid">
            <label>
              Tenant
              <select value={ownerAdminForm.tenantSlug} onChange={(event) => setOwnerAdminForm((current) => ({ ...current, tenantSlug: event.target.value }))}>
                <option value="">Choose tenant</option>
                {ownerTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.slug}>{tenant.name}</option>
                ))}
              </select>
            </label>
            <label>
              Admin name
              <input value={ownerAdminForm.name} onChange={(event) => setOwnerAdminForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Admin email
              <input type="email" value={ownerAdminForm.email} onChange={(event) => setOwnerAdminForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
          </div>
          <button className="primary-button" type="submit">Create setup link</button>
          {ownerSetupLink && (
            <label>
              Setup link
              <input readOnly value={`${setupLinkOrigin}${ownerSetupLink}`} onFocus={(event) => event.target.select()} />
            </label>
          )}
          {adminMessage && <p className="status-line">{adminMessage}</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-title">
          <MapPin size={18} />
          <h2>Tenants</h2>
        </div>
        <div className="admin-list">
          {ownerTenants.map((tenant) => (
            <div className="admin-row" key={tenant.id}>
              <div>
                <strong>{tenant.name}</strong>
                <span>{tenant.slug} · {tenant.memberCount} users</span>
              </div>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => {
                  setOwnerAdminForm((current) => ({ ...current, tenantSlug: tenant.slug }));
                  loadOwnerTenantTemplates(tenant.slug);
                }}
              >
                Add Admin
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Layers size={18} />
          <h2>Tenant Templates</h2>
        </div>
        <label>
          Tenant
          <select value={ownerAdminForm.tenantSlug} onChange={(event) => {
            setOwnerAdminForm((current) => ({ ...current, tenantSlug: event.target.value }));
            loadOwnerTenantTemplates(event.target.value);
          }}>
            <option value="">Choose tenant</option>
            {ownerTenants.map((tenant) => (
              <option key={tenant.id} value={tenant.slug}>{tenant.name}</option>
            ))}
          </select>
        </label>
        <div className="admin-list">
          {(ownerTenantTemplates.templates || []).map((template) => (
            <div className="admin-row" key={template.templateKey}>
              <div>
                <strong>{template.name}</strong>
                <span>{template.templateKey} · {template.isEnabled ? "enabled" : "disabled"}</span>
              </div>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => toggleOwnerTenantTemplate(template.templateKey, !template.isEnabled)}
              >
                {template.isEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
          {ownerAdminForm.tenantSlug && !(ownerTenantTemplates.templates || []).length && (
            <p className="status-line">No templates registered. Onboard templates first.</p>
          )}
        </div>
      </section>
    </div>
  );
}
