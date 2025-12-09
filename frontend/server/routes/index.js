const express = require('express');

const eventsRouter = require('./events');
const importsRouter = require('./imports');
const goalsRouter = require('./goals');
const reflectionsRouter = require('./reflections');
const aiRouter = require('./ai');
const metricsRouter = require('./metrics');
const graphRouter = require('./graph');
const entitiesRouter = require('./entities');
const pillarsRouter = require('./pillars');
const achievementsRouter = require('./achievements');
const settingsRouter = require('./settings');

const router = express.Router();

router.use('/events', eventsRouter);
router.use('/imports', importsRouter);
router.use('/goals', goalsRouter);
router.use('/reflections', reflectionsRouter);
router.use('/ai', aiRouter);
router.use('/metrics', metricsRouter);
router.use('/graph', graphRouter);
router.use('/entities', entitiesRouter);
router.use('/pillars', pillarsRouter);
router.use('/achievements', achievementsRouter);
router.use('/settings', settingsRouter);

module.exports = router;
