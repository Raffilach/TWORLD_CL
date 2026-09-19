import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Card, Chip, Empty, Notice } from "../../shared/ui/primitives";

interface WeeklyReport {
  id: number;
  week_start: string;
  variant: "coach" | "self";
  headline_metric: string;
  verdict: string;
  weak_link: string;
  focus_next_week: string;
  pdf: string | null;
  share_url: string | null;
}

/** Недельный отчёт: PDF, публичная ссылка и копия для ИИ. */
export function ReportTab() {
  const { data, refetch } = useList<WeeklyReport>(["reports"], "/reports/weekly/");
  const [variant, setVariant] = useState<"coach" | "self">("self");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post("/reports/weekly/", { variant });
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const copyForAi = async (reportId: number) => {
    const markdown = await api.text(`/reports/weekly/${reportId}/markdown/`);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("Скопировано — можно вставлять в диалог с ИИ");
    } catch {
      setCopied("Буфер недоступен. Открой markdown по ссылке ниже.");
    }
    window.setTimeout(() => setCopied(null), 4000);
  };

  const share = async (reportId: number) => {
    const link = await api.post<{ url: string }>(`/reports/weekly/${reportId}/share/`, {});
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("Ссылка скопирована. Её можно отозвать в профиле.");
    } catch {
      setCopied(link.url);
    }
    await refetch();
  };

  return (
    <>
      <Card title="Собрать отчёт за неделю">
        <div className="row row--wrap">
          <Chip small pressed={variant === "self"} onClick={() => setVariant("self")}>
            Короткий — для себя
          </Chip>
          <Chip small pressed={variant === "coach"} onClick={() => setVariant("coach")}>
            Подробный — для тренера
          </Chip>
        </div>
        <div style={{ marginTop: "var(--space-3)" }}>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void generate()}>
            {busy ? "Собираем…" : "Собрать"}
          </Button>
        </div>
      </Card>

      {copied && <Notice tone="info">{copied}</Notice>}

      {data?.map((report) => (
        <Card key={report.id} title={`Неделя с ${report.week_start}`}>
          <p className="big-number">{report.headline_metric}</p>
          <p className="muted">{report.verdict}</p>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            <strong>Слабое звено:</strong> {report.weak_link}
          </p>
          <p className="muted">
            <strong>Фокус:</strong> {report.focus_next_week}
          </p>
          <div className="row row--wrap" style={{ marginTop: "var(--space-3)" }}>
            <a
              className="btn"
              href={`${import.meta.env.VITE_API_URL ?? "/api"}/reports/weekly/${report.id}/pdf/`}
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
            <Button onClick={() => void copyForAi(report.id)}>Скопировать для ИИ</Button>
            <Button onClick={() => void share(report.id)}>
              {report.share_url ? "Ссылка есть" : "Публичная ссылка"}
            </Button>
          </div>
          {report.share_url && (
            <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
              {report.share_url} — только чтение, отзывается в профиле.
            </p>
          )}
        </Card>
      ))}

      {data?.length === 0 && <Empty>Отчётов пока нет.</Empty>}
    </>
  );
}
