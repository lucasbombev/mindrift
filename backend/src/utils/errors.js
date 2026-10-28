export class HttpError extends Error {
  constructor(status, message, code = 'erro') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message, code = 'dados_invalidos') {
  return new HttpError(400, message, code);
}

export function unauthorized(message = 'Sessão inválida ou expirada.') {
  return new HttpError(401, message, 'nao_autenticado');
}

export function forbidden(message = 'Você não tem permissão para esta ação.', code = 'sem_permissao') {
  return new HttpError(403, message, code);
}

export function notFound(message = 'Registro não encontrado.') {
  return new HttpError(404, message, 'nao_encontrado');
}

export function conflict(message, code = 'conflito') {
  return new HttpError(409, message, code);
}

export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '50', 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}
