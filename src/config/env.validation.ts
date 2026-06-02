type EnvShape = Record<string, string | undefined>;

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value;
}

export function validateEnv(config: EnvShape): EnvShape {
  // Toujours requis
  requireEnv('DATABASE_URL', config.DATABASE_URL);
  requireEnv('DIRECT_URL', config.DIRECT_URL);

  // Auth requis
  requireEnv(
    'ACCESS_TOKEN_SECRET',
    config.ACCESS_TOKEN_SECRET ?? config.AUTH_SECRET,
  );
  requireEnv(
    'REFRESH_TOKEN_SECRET',
    config.REFRESH_TOKEN_SECRET ?? config.AUTH_SECRET,
  );

  // En production, les cookies cross-origin exigent FRONTEND_URL explicite.
  if (config.NODE_ENV === 'production') {
    requireEnv('FRONTEND_URL', config.FRONTEND_URL);
  }

  return config;
}
