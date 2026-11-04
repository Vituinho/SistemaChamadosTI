#!/usr/bin/env bash
# Copies the Givova TI database from SOURCE to an EMPTY TARGET and proves it.
#
#   SOURCE_URL=postgresql://...  TARGET_URL=postgresql://...  scripts/transfer-database.sh
#
# 1. db-report on SOURCE (read-only)          4. db-report on TARGET → must equal SOURCE
# 2. pg_dump SOURCE (custom format, read-only) 5. npm run migrate on TARGET (additive only)
# 3. refuse unless TARGET has no tables;       6. db-report again → data must be unchanged
#    pg_restore into TARGET
#
# Never drops, truncates or overwrites anything: it aborts if TARGET is not empty.
# Overridable commands (e.g. to run PostgreSQL client tools from Docker):
#   PG_DUMP, PG_RESTORE, PSQL  (pg_dump/pg_restore must be >= the SOURCE server major version)
#   GIVOVA_CLI                 (default: node dist/src/cli/cli.js, run from backend-nest/)
set -euo pipefail

: "${SOURCE_URL:?Defina SOURCE_URL (banco de origem)}"
: "${TARGET_URL:?Defina TARGET_URL (banco de destino VAZIO)}"
PG_DUMP=${PG_DUMP:-pg_dump}
PG_RESTORE=${PG_RESTORE:-pg_restore}
PSQL=${PSQL:-psql}
GIVOVA_CLI=${GIVOVA_CLI:-node dist/src/cli/cli.js}
WORK=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
say() { printf '\n== %s\n' "$*"; }

if [ "$SOURCE_URL" = "$TARGET_URL" ]; then echo "SOURCE_URL e TARGET_URL são iguais. Abortado." >&2; exit 2; fi

say "1/6 Relatório da origem (somente leitura)"
DATABASE_URL="$SOURCE_URL" $GIVOVA_CLI db-report --json > "$WORK/source.json"
cat "$WORK/source.json"
if grep -q '"error"' "$WORK/source.json"; then echo "Origem sem o schema esperado. Abortado." >&2; exit 3; fi

say "2/6 pg_dump da origem"
$PG_DUMP --format=custom --no-owner --no-acl --dbname="$SOURCE_URL" > "$WORK/givova.dump"
ls -l "$WORK/givova.dump"

say "3/6 Verificando que o destino está vazio e restaurando"
TABLES=$($PSQL "$TARGET_URL" -At -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema()")
if [ "$TABLES" != "0" ]; then
  echo "O destino já tem $TABLES tabela(s). Nada foi alterado. Use um banco vazio." >&2
  exit 4
fi
$PG_RESTORE --no-owner --no-acl --exit-on-error --single-transaction --dbname="$TARGET_URL" < "$WORK/givova.dump"

compare() { # $1 expected json, $2 actual json, $3 extra keys to ignore
  node -e '
    const fs = require("fs");
    const [a, b, extra] = [JSON.parse(fs.readFileSync(process.argv[1])), JSON.parse(fs.readFileSync(process.argv[2])), (process.argv[3] || "").split(",")];
    const ignore = new Set(["database", "server_version", ...extra]);
    const diff = Object.keys({ ...a, ...b }).filter(k => !ignore.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (diff.length) { console.error("DIVERGÊNCIA:", diff.map(k => `${k}: ${JSON.stringify(a[k])} != ${JSON.stringify(b[k])}`).join("; ")); process.exit(5); }
    console.log("Idêntico (" + Object.keys(a).filter(k => !ignore.has(k)).length + " verificações).");
  ' "$1" "$2" "${3:-}"
}

say "4/6 Relatório do destino restaurado"
DATABASE_URL="$TARGET_URL" $GIVOVA_CLI db-report --json > "$WORK/restored.json"
compare "$WORK/source.json" "$WORK/restored.json"

say "5/6 Migrations aditivas no destino"
DATABASE_URL="$TARGET_URL" $GIVOVA_CLI migrate

say "6/6 Dados após as migrations"
DATABASE_URL="$TARGET_URL" $GIVOVA_CLI db-report --json > "$WORK/migrated.json"
compare "$WORK/source.json" "$WORK/migrated.json" "schema_migrations"
grep -q '0006_history_kind_and_indexes' "$WORK/migrated.json" || { echo "0006 não aplicada." >&2; exit 6; }

say "Concluído. Relatórios e dump em $WORK (guarde o dump como backup; contém dados pessoais)."
