export const widthBreakpoints = {
  smallPhone: 380,
  phone: 420,
  largePhone: 480,
  phablet: 540,
  smallTablet: 600,
  tablet: 700,
  mobile: 780,
  laptop: 1050,
  desktop: 1150,
} as const;

export const heightBreakpoints = {
  shortViewport: 700,
} as const;

export const mobileLayoutQuery = `(max-width: ${widthBreakpoints.mobile}px)`;
