import { SITES } from '../../../config/sites.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';
import { loginNegativeTests } from '../../../src/suites/login-negative.ts';

loginNegativeTests(SITES.qastarting, {
  open: async (page) => {
    const site = new QaStartingSite(page);
    await site.open();
    await site.loginLink().click();
  },
  stayOn: /qastarting\.org/,
});
