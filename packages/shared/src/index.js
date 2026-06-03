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
  JD_WS:           (wsId) => `/api/jourdoc/${wsId}`,
  JD_OBJETS:       (wsId) => `/api/jourdoc/${wsId}/objets`,
  JD_OBJET:        (wsId, id) => `/api/jourdoc/${wsId}/objets/${id}`,
  JD_OBJET_NOTES:  (wsId, id) => `/api/jourdoc/${wsId}/objets/${id}/notes`,
  JD_THEMES:       (wsId) => `/api/jourdoc/${wsId}/themes`,
  JD_THEME:        (wsId, id) => `/api/jourdoc/${wsId}/themes/${id}`,
  JD_NOTES:        (wsId) => `/api/jourdoc/${wsId}/notes`,
  JD_NOTE:         (wsId, id) => `/api/jourdoc/${wsId}/notes/${id}`,
  JD_MEDIAS:       (wsId) => `/api/jourdoc/${wsId}/medias`,
  JD_MEDIA:        (wsId, id) => `/api/jourdoc/${wsId}/medias/${id}`,
  JD_NOTE_MEDIAS:  (wsId, noteId) => `/api/jourdoc/${wsId}/notes/${noteId}/medias`,
}
