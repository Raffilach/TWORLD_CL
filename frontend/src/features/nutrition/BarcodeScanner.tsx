import { useEffect, useRef, useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

interface FoundFood {
  name: string;
  protein_g: number | null;
  calories: number | null;
  barcode: string;
}

/**
 * Сканер штрихкодов.
 *
 * Используется системный `BarcodeDetector` (Safari 17+, Chrome): он быстрый
 * и не тянет за собой мегабайт библиотеки. Где его нет — остаётся ручной
 * ввод кода: сканирование не должно быть единственным путём.
 *
 * Поиск идёт сначала по личной базе, затем в Open Food Facts —
 * открытом справочнике без ключа и регистрации.
 */
export function BarcodeScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [found, setFound] = useState<FoundFood | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setFound(null);
      setStatus(null);
      return;
    }

    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (options: unknown) => {
          detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }

    let stopped = false;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              await lookup(codes[0].rawValue);
              return;
            }
          } catch {
            /* кадр не распознан — пробуем следующий */
          }
          window.setTimeout(() => void scan(), 400);
        };
        void scan();
      } catch {
        setSupported(false);
      }
    })();

    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const lookup = async (code: string) => {
    setStatus("Ищем…");
    try {
      const own = await api.get<{ found: boolean; item: FoundFood }>(
        "/nutrition/foods/barcode/",
        { code },
      );
      if (own.found) {
        setFound(own.item);
        setStatus(null);
        return;
      }
    } catch {
      /* в личной базе нет — идём в открытый справочник */
    }
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments`,
      );
      const data = await response.json();
      if (data.product) {
        setFound({
          name: data.product.product_name || `Товар ${code}`,
          protein_g: data.product.nutriments?.proteins_100g ?? null,
          calories: data.product.nutriments?.["energy-kcal_100g"] ?? null,
          barcode: code,
        });
        setStatus(null);
      } else {
        setStatus("Не нашли. Можно завести продукт вручную.");
      }
    } catch {
      setStatus("Справочник недоступен — заведи продукт вручную.");
    }
  };

  const save = async () => {
    if (!found) return;
    await api.post("/nutrition/foods/", {
      name: found.name,
      serving_label: "100 г",
      serving_grams: 100,
      protein_g: found.protein_g ?? 0,
      calories: found.calories ?? null,
      barcode: found.barcode,
    });
    setStatus("Добавлено в твою базу.");
    setFound(null);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Штрихкод">
      {supported ? (
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-sunken)",
          }}
        />
      ) : (
        <Notice tone="info">
          Браузер не умеет сканировать штрихкоды. Введи код цифрами — результат тот же.
        </Notice>
      )}

      <label className="field" style={{ marginTop: "var(--space-3)" }}>
        <span className="field__label">Или ввести код</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={manual}
          placeholder="4600000000000"
          onChange={(event) => setManual(event.target.value.replace(/\D/g, ""))}
        />
      </label>
      <Button onClick={() => void lookup(manual)} disabled={manual.length < 8}>
        Найти
      </Button>

      {status && (
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          {status}
        </p>
      )}

      {found && (
        <div className="card" style={{ marginTop: "var(--space-3)" }}>
          <strong>{found.name}</strong>
          <p className="muted">
            {found.protein_g !== null ? `${found.protein_g} г белка на 100 г` : "белок неизвестен"}
          </p>
          <Button variant="primary" onClick={() => void save()}>
            Добавить в свою базу
          </Button>
        </div>
      )}
    </Sheet>
  );
}
