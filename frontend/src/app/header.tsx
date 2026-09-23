import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Действие в шапке экрана: «+» у питания, шестерёнка у профиля.
 *
 * Шапку рисует Layout, а действие знает только сам экран — поэтому
 * экран кладёт кнопку сюда, а Layout показывает её справа от заголовка.
 */
const HeaderContext = createContext<(node: ReactNode) => void>(() => undefined);

export function HeaderActionProvider({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange: (node: ReactNode) => void;
}) {
  return <HeaderContext.Provider value={onChange}>{children}</HeaderContext.Provider>;
}

export function useHeaderAction(node: ReactNode, deps: unknown[] = []) {
  const set = useContext(HeaderContext);
  useEffect(() => {
    set(node);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useHeaderActionState() {
  return useState<ReactNode>(null);
}
