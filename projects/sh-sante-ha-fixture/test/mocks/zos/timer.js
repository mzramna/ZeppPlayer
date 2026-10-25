export const createSysTimer = (periodic, period, cb, arg) => (periodic ? setInterval : setTimeout)(() => cb(arg), period);
export const stopTimer = (id) => { clearInterval(id); clearTimeout(id); };
