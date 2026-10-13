import { SITES } from '../../../config/sites.ts';
import { commonUiTests } from '../../../src/suites/common-ui.ts';

// Language switching has its own, site-specific tests.
commonUiTests(SITES.qastarting, { languageSwitch: false });
