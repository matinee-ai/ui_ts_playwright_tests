import { SITES } from '../../../config/sites.ts';
import { commonApiTests } from '../../../src/suites/common-api.ts';

commonApiTests(SITES.spas);
