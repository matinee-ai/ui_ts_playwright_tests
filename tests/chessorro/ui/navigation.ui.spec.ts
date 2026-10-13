import { SITES } from '../../../config/sites.ts';
import { PAGES } from '../../../src/pages/chessorro.ts';
import { linkTests } from '../../../src/suites/links.ts';
import { navigationTests } from '../../../src/suites/navigation.ts';

navigationTests(SITES.chessorro, { homeLink: /^Chessorro$/, pages: PAGES });
linkTests(SITES.chessorro, PAGES.slice(0, 8));
