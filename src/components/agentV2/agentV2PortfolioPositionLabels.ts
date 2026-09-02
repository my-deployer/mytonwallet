const LABELS = {
  en: {
    title: 'Largest positions',
    unpriced: 'Not included',
    unpricedValue: 'not included',
    more: (count: number) => `+${count} more`,
    partial: 'Some positions could not be valued or are not shown.',
    history: (chain: string) => `History on ${chain}`,
    noActivity: 'No recent activity.',
  },
  ru: {
    title: 'Крупнейшие позиции',
    unpriced: 'Не учтены',
    unpricedValue: 'не учтён',
    more: (count: number) => `ещё ${count}`,
    partial: 'Некоторые позиции не удалось оценить или показать.',
    history: (chain: string) => `История в ${chain}`,
    noActivity: 'Недавней истории нет.',
  },
  de: {
    title: 'Größte Positionen', unpriced: 'Nicht berücksichtigt', unpricedValue: 'nicht berücksichtigt',
    more: (count: number) => `+${count} weitere`,
    partial: 'Einige Positionen konnten nicht bewertet oder angezeigt werden.',
    history: (chain: string) => `Verlauf auf ${chain}`, noActivity: 'Keine aktuellen Aktivitäten.',
  },
  es: {
    title: 'Posiciones más grandes', unpriced: 'No incluidas', unpricedValue: 'no incluida',
    more: (count: number) => `+${count} más`, partial: 'Algunas posiciones no se pudieron valorar o mostrar.',
    history: (chain: string) => `Historial en ${chain}`, noActivity: 'No hay actividad reciente.',
  },
  fa: {
    title: 'بزرگ‌ترین موقعیت‌ها', unpriced: 'محاسبه‌نشده', unpricedValue: 'محاسبه‌نشده',
    more: (count: number) => `${count}+ مورد دیگر`, partial: 'برخی موقعیت‌ها قابل ارزش‌گذاری یا نمایش نبودند.',
    history: (chain: string) => `تاریخچه در ${chain}`, noActivity: 'فعالیت اخیری وجود ندارد.',
  },
  ar: {
    title: 'أكبر المراكز', unpriced: 'غير محتسبة', unpricedValue: 'غير محتسب',
    more: (count: number) => `${count}+ أخرى`, partial: 'تعذر تقييم أو عرض بعض المراكز.',
    history: (chain: string) => `السجل على ${chain}`, noActivity: 'لا يوجد نشاط حديث.',
  },
  pl: {
    title: 'Największe pozycje', unpriced: 'Nieuwzględnione', unpricedValue: 'nieuwzględniona',
    more: (count: number) => `+${count} więcej`, partial: 'Niektórych pozycji nie udało się wycenić lub pokazać.',
    history: (chain: string) => `Historia w ${chain}`, noActivity: 'Brak ostatniej aktywności.',
  },
  th: {
    title: 'รายการที่มีมูลค่าสูงสุด', unpriced: 'ไม่รวมในการคำนวณ', unpricedValue: 'ไม่รวม',
    more: (count: number) => `อีก ${count} รายการ`, partial: 'บางรายการไม่สามารถประเมินมูลค่าหรือแสดงได้',
    history: (chain: string) => `ประวัติบน ${chain}`, noActivity: 'ไม่มีกิจกรรมล่าสุด',
  },
  tr: {
    title: 'En büyük pozisyonlar', unpriced: 'Dahil edilmeyenler', unpricedValue: 'dahil edilmedi',
    more: (count: number) => `+${count} daha`, partial: 'Bazı pozisyonlar değerlenemedi veya gösterilemiyor.',
    history: (chain: string) => `${chain} geçmişi`, noActivity: 'Yakın tarihli etkinlik yok.',
  },
  uk: {
    title: 'Найбільші позиції', unpriced: 'Не враховані', unpricedValue: 'не враховано',
    more: (count: number) => `ще ${count}`, partial: 'Деякі позиції не вдалося оцінити або показати.',
    history: (chain: string) => `Історія в ${chain}`, noActivity: 'Нещодавньої історії немає.',
  },
} as const;

export function getPortfolioPositionLabels(langCode?: string) {
  const code = langCode?.toLocaleLowerCase('en-US').split(/[-_]/u)[0] as keyof typeof LABELS;
  return LABELS[code] ?? LABELS.en;
}
