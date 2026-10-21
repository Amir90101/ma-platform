// Админка. Шапку и навигацию рисуют вложенные layout: список заведений —
// (home), экраны заведения — [venueId].
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
