const { queryOne } = require("../config/postgres")
const { normalizeCompanyKey } = require("../utils/compactContext")

const FRESH_DAYS = 30

function mapRow(row) {
    if (!row) return null
    return {
        companyKey: row.company_key,
        companyLabel: row.company_label,
        payload: row.payload || {},
        updatedAt: row.updated_at,
    }
}

async function findFresh(companyKey) {
    if (!companyKey) return null
    const row = await queryOne(
        `
        SELECT company_key, company_label, payload, updated_at
        FROM company_research_cache
        WHERE company_key = $1
          AND updated_at > NOW() - INTERVAL '30 days'
        LIMIT 1
        `,
        [companyKey]
    )
    return mapRow(row)
}

async function upsert({ companyKey, companyLabel, payload }) {
    const row = await queryOne(
        `
        INSERT INTO company_research_cache (company_key, company_label, payload, updated_at)
        VALUES ($1, $2, $3::jsonb, NOW())
        ON CONFLICT (company_key) DO UPDATE SET
            company_label = EXCLUDED.company_label,
            payload = EXCLUDED.payload,
            updated_at = NOW()
        RETURNING company_key, company_label, payload, updated_at
        `,
        [companyKey, companyLabel, JSON.stringify(payload || {})]
    )
    return mapRow(row)
}

module.exports = {
    FRESH_DAYS,
    normalizeCompanyKey,
    findFresh,
    upsert,
}
