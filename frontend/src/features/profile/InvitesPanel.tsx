import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { haptic } from "../../shared/hooks/useHaptics";
import { Button, Empty, IconButton, Segmented } from "../../shared/ui/primitives";

interface Invite {
  id: number;
  code: string;
  note: string;
  max_uses: number;
  used_count: number;
  uses_left: number;
  is_usable: boolean;
  is_active: boolean;
  redeemed_by: string[];
}

/**
 * Приглашения на бету — только для администратора.
 *
 * Код уходит тестеру ссылкой: по ней сразу открывается регистрация
 * с подставленным кодом, вводить ничего не нужно.
 */
export function InvitesPanel() {
  const invites = useList<Invite>(["invites"], "/invites/");
  const [note, setNote] = useState("");
  const [uses, setUses] = useState<"1" | "5" | "20">("1");
  const [copied, setCopied] = useState<number | null>(null);

  const linkFor = (code: string) => `${window.location.origin}/?invite=${code}`;

  const create = async () => {
    haptic("success");
    const invite = await api.post<Invite>("/invites/", { note, max_uses: Number(uses) });
    setNote("");
    await invites.refetch();
    await share(invite);
  };

  const share = async (invite: Invite) => {
    const url = linkFor(invite.code);
    const text = `Приглашаю в бету TWORLD — трекер тренировок и привычек. Код: ${invite.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "TWORLD", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(invite.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      /* пользователь закрыл меню «Поделиться» — ничего страшного */
    }
  };

  const revoke = async (invite: Invite) => {
    await api.patch(`/invites/${invite.id}/`, { is_active: false });
    await invites.refetch();
  };

  return (
    <div className="stack">
      <p className="muted">
        Тестер откроет ссылку — и сразу попадёт в регистрацию с подставленным кодом.
        После регистрации его встретит стартовый опрос.
      </p>

      <label className="field">
        <span className="field__label">Для кого (видно только тебе)</span>
        <input value={note} placeholder="Например: Маша из зала" onChange={(event) => setNote(event.target.value)} />
      </label>
      <span className="field__label">Сколько регистраций по одному коду</span>
      <Segmented
        label="Сколько регистраций"
        value={uses}
        onChange={setUses}
        options={[
          { id: "1", label: "1 человек" },
          { id: "5", label: "до 5" },
          { id: "20", label: "до 20" },
        ]}
      />
      <Button variant="primary" size="lg" onClick={() => void create()}>
        Создать приглашение
      </Button>

      <div className="list">
        {invites.data?.map((invite) => (
          <div key={invite.id} className="list__item">
            <span className="grow">
              <span className="strong mono">{invite.code}</span>
              {invite.note && <span className="tiny"> · {invite.note}</span>}
              <br />
              <span className="tiny">
                {invite.is_usable
                  ? `осталось ${invite.uses_left} из ${invite.max_uses}`
                  : invite.is_active
                    ? "использован"
                    : "отозван"}
                {invite.redeemed_by.length > 0 && ` · ${invite.redeemed_by.join(", ")}`}
              </span>
            </span>
            {invite.is_usable && (
              <>
                <IconButton
                  icon={copied === invite.id ? "check" : "send"}
                  label={copied === invite.id ? "Скопировано" : "Поделиться ссылкой"}
                  onClick={() => void share(invite)}
                />
                <IconButton icon="close" label="Отозвать" variant="plain" onClick={() => void revoke(invite)} />
              </>
            )}
          </div>
        ))}
        {invites.data?.length === 0 && <Empty>Приглашений пока нет.</Empty>}
      </div>
    </div>
  );
}
