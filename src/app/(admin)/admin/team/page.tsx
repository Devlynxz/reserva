import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, AdminField } from "@/components/admin/action-form";
import { Badge, Card, CardBody, CardHeader, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { createMemberAction, setDisabledAction } from "@/server/actions/admin/team";
import { listTeam } from "@/server/data/team";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function TeamPage() {
  const session = await requireArea("team");
  const team = await listTeam();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Team</h1>
        <p className="max-w-prose text-ink-muted">
          Owners can do everything. Staff handle bookings, the calendar and the catalog, but not settings, the team or reports.
        </p>
      </div>

      <Table label="Team">
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {team.map((u) => (
            <Tr key={u.id}>
              <Td>
                <span className="font-semibold">{u.name}</span>
                {u.id === session.userId && <span className="text-ink-muted"> (you)</span>}
                <span className="block text-xs text-ink-muted">{u.email}</span>
              </Td>
              <Td>{u.role === "ADMIN" ? "Owner" : "Staff"}</Td>
              <Td>{u.disabledAt ? <Badge>Disabled</Badge> : <Badge tone="success">Active</Badge>}</Td>
              <Td className="text-right">
                {u.id !== session.userId &&
                  (u.disabledAt ? (
                    <ActionButton action={setDisabledAction.bind(null, u.id, false)} label="Enable" />
                  ) : (
                    <ActionButton
                      action={setDisabledAction.bind(null, u.id, true)}
                      label="Disable"
                      confirm={{
                        title: `Disable ${u.name}?`,
                        description: "They're signed out everywhere and can't sign in. Their history stays.",
                        confirmLabel: "Disable",
                      }}
                    />
                  ))}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="max-w-3xl">
        <CardHeader title="Add someone" description="Share the email and password with them directly. There's no public sign-up." />
        <CardBody>
          <ActionForm action={createMemberAction} submitLabel="Create account" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField name="name" label="Name" required autoComplete="off" />
              <AdminField name="email" label="Email" type="email" required autoComplete="off" />
              <AdminField
                name="role"
                label="Role"
                type="select"
                defaultValue="STAFF"
                options={[
                  { value: "STAFF", label: "Staff" },
                  { value: "ADMIN", label: "Owner" },
                ]}
              />
              <AdminField name="password" label="First password" type="password" required autoComplete="new-password" hint="At least 12 characters." />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
