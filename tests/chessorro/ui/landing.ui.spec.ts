import { expect, test } from '../../../src/fixtures.ts';
import { CORE_FEATURES, ChessorroApp } from '../../../src/pages/chessorro.ts';

test.describe('Chessorro: landing page', () => {
  test('presents every core feature', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.open();
    for (const feature of CORE_FEATURES) {
      await expect(app.section(feature.heading), feature.name).toBeVisible();
    }
  });
});
