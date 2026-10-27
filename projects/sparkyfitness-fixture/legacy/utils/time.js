export const pad = (n) => String(n).padStart(2, '0')
export const hhmm = (iso) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
