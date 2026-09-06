DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "user") > 1 THEN
    RAISE EXCEPTION 'Refusing single-admin index: multiple users exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "user_single_admin" ON "user" ((true));
