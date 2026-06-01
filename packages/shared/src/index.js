// Constantes partagées entre le frontend et le backend

export const APP_SLUGS = {
  JOURDOC: 'jourdoc',
}

export const ROLES = {
  OWNER: 'owner',
  MEMBER: 'member',
}

export const API_ROUTES = {
  AUTH_LOGIN: '/api/auth/login',
  AUTH_LOGOUT: '/api/auth/logout',
  ADMIN_LOGIN: '/api/admin/login',
  ADMIN_VERIFY_OTP: '/api/admin/verify-otp',
  ADMIN_SETTINGS_REQUEST_OTP: '/api/admin/settings/request-otp',
  ADMIN_SETTINGS_CONFIRM: '/api/admin/settings/confirm',
  ME_APPS: '/api/me/apps',
  ME_WORKSPACES: (slug) => `/api/me/apps/${slug}/workspaces`,
}
