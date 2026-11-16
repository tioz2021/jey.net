"use client";

import { CollectionManager } from "@/components/collection-manager";
import { useI18n } from "@/lib/locale-context";
import { NotebookTabs } from "@/components/notebook-tabs";
import { useState } from "react";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";

export function CollectionsScreen() {
  const { t } = useI18n();
  const [view, setView] = useState<ViewMode>(() => readViewPreference("jey:view:collections", "grid"));
  return (
    <main>
      <NotebookTabs />
      <div className="section-toolbar">
        <ViewSwitch
          onChange={(value) => {
            setView(value);
            saveViewPreference("jey:view:collections", value);
          }}
          value={view}
        />
      </div>
      <CollectionManager view={view} />
    </main>
  );
}
