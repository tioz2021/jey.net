"use client";

import { CollectionManager } from "@/components/collection-manager";
import { useI18n } from "@/lib/locale-context";
import { NotebookTabs } from "@/components/notebook-tabs";
import { useState } from "react";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";

export function CollectionsScreen() {
  const { t } = useI18n();
  const [view, setView] = useState<ViewMode>("grid");
  return (
    <main>
      <NotebookTabs />
      <div className="section-toolbar">
        <ViewSwitch onChange={setView} value={view} />
      </div>
      <CollectionManager view={view} />
    </main>
  );
}
