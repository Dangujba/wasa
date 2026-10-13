export function createRaceStore(pool) {
  return {
    async save(result) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          'INSERT INTO race_results(id,course_id,course_version,outcome,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id',
          [result.id, result.courseId, result.courseVersion, result.outcome, result.reason]);
        if (inserted.rowCount) for (const p of result.players) {
          // Serialize with concurrent account deletion. If it already happened,
          // save anonymous participation; otherwise ON DELETE SET NULL follows.
          const user = await client.query('SELECT id FROM users WHERE id=$1 FOR KEY SHARE', [p.id]);
          await client.query('INSERT INTO race_participants(match_id,lane,user_id,placement,elapsed_ms,points) VALUES($1,$2,$3,$4,$5,$6)',
            [result.id, p.lane, user.rows[0]?.id || null, p.placement, p.elapsedMs, p.points]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    },
    async history(userId) {
      const {rows} = await pool.query(`SELECT r.id,r.course_id AS "courseId",r.course_version AS "courseVersion",r.outcome,r.reason,
        r.completed_at AS "completedAt",json_agg(json_build_object('lane',p.lane,'displayName',COALESCE(pp.display_name,'Deleted player'),
        'placement',p.placement,'elapsedMs',p.elapsed_ms,'points',p.points) ORDER BY p.lane) AS players
        FROM race_results r JOIN race_participants p ON p.match_id=r.id LEFT JOIN player_profiles pp ON pp.user_id=p.user_id
        WHERE r.id IN (SELECT match_id FROM race_participants WHERE user_id=$1)
        GROUP BY r.id ORDER BY r.completed_at DESC LIMIT 20`, [userId]);
      return rows;
    },
    async leaderboard() {
      const {rows} = await pool.query(`SELECT pp.display_name AS "displayName",SUM(p.points)::int AS points,
        COUNT(*) FILTER(WHERE p.placement=1 AND r.outcome IN ('finish','forfeit'))::int AS wins,
        COUNT(*)::int AS races,MIN(p.elapsed_ms) FILTER(WHERE r.outcome IN ('finish','draw'))::int AS "bestMs"
        FROM race_participants p JOIN race_results r ON r.id=p.match_id JOIN player_profiles pp ON pp.user_id=p.user_id
        WHERE r.outcome<>'abandoned' GROUP BY pp.user_id,pp.display_name
        ORDER BY points DESC,wins DESC,"bestMs" ASC NULLS LAST,pp.user_id LIMIT 25`);
      return rows.map((p, i) => ({rank: i + 1, ...p}));
    }
  };
}
