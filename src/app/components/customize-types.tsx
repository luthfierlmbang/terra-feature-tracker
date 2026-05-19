import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, User, Users } from "lucide-react";
import { Input, UiButton, Select } from "./primitives";
import { toast } from "./toast";

export type TypeKey = "featureStatus" | "designStatus" | "designSource" | "action" | "module" | "squad";

export type TypesState = Record<TypeKey, string[]>;

const GROUPS: { key: TypeKey; title: string; description: string }[] = [
  { key: "featureStatus", title: "Feature Status", description: "Values used for tracking feature progress." },
  { key: "designStatus", title: "Design Status", description: "Reflects the current state of the design work." },
  { key: "designSource", title: "Design Source", description: "Where the design originates from." },
  { key: "action", title: "Action Needed", description: "Required follow-up actions by Design & Research." },
  { key: "module", title: "Modules", description: "Product modules tracked in this dashboard." },
  { key: "squad", title: "Squads", description: "Teams that own feature delivery." },
];

export function CustomizeTypes({
  types,
  onChange,
  onRename,
  onDelete,
  squadOwners,
  onSquadOwnerChange,
  moduleSquads,
  onModuleSquadChange,
}: {
  types: TypesState;
  onChange: (types: TypesState) => void;
  onRename?: (key: TypeKey, oldVal: string, newVal: string) => void;
  onDelete?: (key: TypeKey, val: string) => void;
  squadOwners?: Record<string, string>;
  onSquadOwnerChange?: (squad: string, owner: string) => void;
  moduleSquads?: Record<string, string>;
  onModuleSquadChange?: (moduleName: string, squad: string) => void;
}) {
  const [active, setActive] = useState<TypeKey>("featureStatus");
  const [draft, setDraft] = useState("");
  const [draftOwner, setDraftOwner] = useState(""); // for squad PO
  const [draftModuleSquad, setDraftModuleSquad] = useState(""); // for module -> squad
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editOwnerDraft, setEditOwnerDraft] = useState("");
  const [editModuleSquadDraft, setEditModuleSquadDraft] = useState("");

  const list = types[active] || [];
  const isSquad = active === "squad";
  const isModule = active === "module";

  function addItem() {
    const val = draft.trim();
    if (!val || list.includes(val)) return;
    onChange({ ...types, [active]: [...list, val] });

    // If squad, also set the PO mapping
    if (isSquad && onSquadOwnerChange) {
      onSquadOwnerChange(val, draftOwner.trim());
    }

    // If module, also set the squad mapping
    if (isModule && onModuleSquadChange) {
      onModuleSquadChange(val, draftModuleSquad);
    }

    toast.success("Value added", `"${val}" has been added to ${GROUPS.find(g => g.key === active)?.title}.`);
    setDraft("");
    setDraftOwner("");
    setDraftModuleSquad("");
  }

  function removeItem(value: string) {
    if (onDelete) {
      onDelete(active, value);
    } else {
      onChange({ ...types, [active]: list.filter((v) => v !== value) });
    }
    toast.warning("Value removed", `"${value}" has been removed. Existing features using this value are unaffected.`);
  }

  function startEdit(value: string) {
    setEditingItem(value);
    setEditDraft(value);
    if (isSquad && squadOwners) {
      setEditOwnerDraft(squadOwners[value] || "");
    }
    if (isModule && moduleSquads) {
      setEditModuleSquadDraft(moduleSquads[value] || "");
    }
  }

  function saveEdit() {
    if (!editingItem) return;
    const val = editDraft.trim();

    // If empty or duplicate, just cancel
    if (!val || (val !== editingItem && list.includes(val))) {
      setEditingItem(null);
      return;
    }

    const nameChanged = val !== editingItem;

    if (nameChanged) {
      if (onRename) {
        onRename(active, editingItem, val);
      } else {
        onChange({
          ...types,
          [active]: list.map((v) => (v === editingItem ? val : v)),
        });
      }
    }

    // Update squad owner if squad tab
    if (isSquad && onSquadOwnerChange) {
      const targetKey = nameChanged ? val : editingItem;
      onSquadOwnerChange(targetKey, editOwnerDraft.trim());
    }

    // Update module squad if module tab
    if (isModule && onModuleSquadChange) {
      const targetKey = nameChanged ? val : editingItem;
      onModuleSquadChange(targetKey, editModuleSquadDraft);
    }

    toast.success("Value updated", "Type value has been updated successfully.");
    setEditingItem(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 18,
            lineHeight: "28px",
            color: "#171717",
          }}
        >
          Customize types
        </h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252" }}>
          Manage the dropdown values used across the feature tracker.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-2" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          {GROUPS.map((g) => {
            const isActive = g.key === active;
            return (
              <button
                key={g.key}
                onClick={() => { setActive(g.key); setEditingItem(null); setDraft(""); setDraftOwner(""); setDraftModuleSquad(""); }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left ${isActive ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"}`}
              >
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: isActive ? "#262626" : "#404040",
                  }}
                >
                  {g.title}
                </span>
                <span
                  className="inline-flex items-center rounded-md border border-[#d4d4d4] bg-white px-1.5 py-0.5"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: "18px",
                    color: "#404040",
                  }}
                >
                  {(types[g.key] || []).length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-[#e5e5e5] bg-white" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <div className="border-b border-[#e5e5e5] p-5">
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, lineHeight: "24px", color: "#171717" }}>
              {GROUPS.find((g) => g.key === active)?.title}
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252" }}>
              {GROUPS.find((g) => g.key === active)?.description}
              {isSquad && (
                <span className="ml-1 text-[#027479] font-medium">Squad names are linked to a Product Owner.</span>
              )}
              {isModule && (
                <span className="ml-1 text-[#027479] font-medium">Modules can be linked to their managing Squad.</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 border-b border-[#e5e5e5] p-4 sm:p-5 md:flex md:items-end">
            <div className="min-w-0 flex-1">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder={isSquad ? "Squad name…" : isModule ? "Module name…" : "Add a new value…"}
              />
            </div>
            {isSquad && (
              <div className="min-w-0 flex-1">
                <Input
                  value={draftOwner}
                  onChange={(e) => setDraftOwner(e.target.value)}
                  placeholder="Product Owner name…"
                />
              </div>
            )}
            {isModule && (
              <div className="min-w-0 flex-1">
                <Select
                  value={draftModuleSquad}
                  onChange={(val) => setDraftModuleSquad(val)}
                  options={types.squad || []}
                  placeholder="Select Squad"
                />
              </div>
            )}
            <UiButton variant="primary" leadingIcon={<Plus size={18} strokeWidth={1.67} color="#fff" />} onClick={addItem}>
              Add value
            </UiButton>
          </div>

          <ul className="divide-y divide-[#f3f4f6]">
            {list.map((item) => (
              <li key={item} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                {editingItem === item ? (
                  <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Input
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit();
                          } else if (e.key === "Escape") {
                            setEditingItem(null);
                          }
                        }}
                        autoFocus
                      />
                    </div>
                    {isSquad && (
                      <div className="min-w-0 flex-1">
                        <Input
                          value={editOwnerDraft}
                          onChange={(e) => setEditOwnerDraft(e.target.value)}
                          placeholder="Product Owner…"
                        />
                      </div>
                    )}
                    {isModule && (
                      <div className="min-w-0 flex-1">
                        <Select
                          value={editModuleSquadDraft}
                          onChange={(val) => setEditModuleSquadDraft(val)}
                          options={types.squad || []}
                          placeholder="Select Squad"
                        />
                      </div>
                    )}
                    <button
                      onClick={saveEdit}
                      className="inline-flex size-8 items-center justify-center rounded-md bg-[#f4ebff] hover:bg-[#e9d5ff]"
                    >
                      <Check size={16} strokeWidth={2} color="#027479" />
                    </button>
                    <button
                      onClick={() => setEditingItem(null)}
                      className="inline-flex size-8 items-center justify-center rounded-md bg-[#fef3f2] hover:bg-[#fee4e2]"
                    >
                      <X size={16} strokeWidth={2} color="#b42318" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#171717" }}>
                        {item}
                      </span>
                      {isSquad && squadOwners && squadOwners[item] ? (
                        <span className="flex items-center gap-1" style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, lineHeight: "18px", color: "#737373" }}>
                          <User size={11} strokeWidth={1.5} />
                          {squadOwners[item]}
                        </span>
                      ) : null}
                      {isModule && moduleSquads && moduleSquads[item] ? (
                        <span className="flex items-center gap-1" style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, lineHeight: "18px", color: "#737373" }}>
                          <Users size={11} strokeWidth={1.5} />
                          {moduleSquads[item]}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[#f3f4f6]"
                        style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, lineHeight: "18px", color: "#525252" }}
                      >
                        <Edit2 size={14} strokeWidth={1.67} /> Edit
                      </button>
                      <button
                        onClick={() => removeItem(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[#fef3f2]"
                        style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, lineHeight: "18px", color: "#b42318" }}
                      >
                        <Trash2 size={14} strokeWidth={1.67} /> Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {list.length === 0 && (
              <li className="px-5 py-8 text-center" style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, color: "#737373" }}>
                No values yet — add your first one above.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
