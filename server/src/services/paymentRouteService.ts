/**
 * Payment Route Service — Impact Direct outbound payees
 *
 * Paper source drives who Impact pays for production:
 *
 * BRADFORD paper (paperSource=BRADFORD):
 *   Impact → Bradford (full outlay: paper + markup + mfg + Bradford margin)
 *   Bradford → JD (mfg only) — tracked, not an Impact check
 *
 * JD / vendor paper (paperSource=VENDOR):
 *   Impact → JD (production: mfg + paper)
 *   Impact → Bradford (margin split only — no paper markup)
 *
 * CUSTOMER paper:
 *   Same as JD paper for pay routing (Impact pays producer JD; Bradford margin only)
 */

export type PaperSourceKey = 'BRADFORD' | 'VENDOR' | 'CUSTOMER' | string | null | undefined;

/** Who Impact pays for *production* (exclusive). */
export type ImpactProductionPayee = 'BRADFORD' | 'JD';

export interface PaymentRoute {
  paperSource: 'BRADFORD' | 'VENDOR' | 'CUSTOMER';
  /** Exclusive production payee from Impact. */
  productionPayee: ImpactProductionPayee;
  /** Bradford still gets a margin share even when JD is production payee. */
  bradfordGetsMarginShare: boolean;
  /** Whether Bradford→JD mfg transfer should be tracked. */
  trackBradfordPaysJd: boolean;
  /** Auto-send JD invoice to Bradford when Impact pays Bradford. */
  sendJdInvoiceToBradford: boolean;
  labels: {
    productionStage: string;
    secondaryStage: string;
  };
}

export interface ProfitLike {
  sellPrice?: number;
  totalCost?: number;
  impactTotal?: number;
  bradfordTotal?: number;
  bradfordSpreadShare?: number;
  paperMarkup?: number;
  paperCost?: number;
  bradfordOwesJD?: number;
}

export interface PaymentAmounts {
  /** Impact → Bradford check amount (0 if N/A this step). */
  impactToBradford: number;
  /** Impact → JD check amount (JD-paper route only). */
  impactToJd: number;
  /** Bradford → JD mfg amount (Bradford-paper route tracking). */
  bradfordToJdMfg: number;
  route: PaymentRoute;
}

function normalizePaperSource(paperSource: PaperSourceKey): 'BRADFORD' | 'VENDOR' | 'CUSTOMER' {
  if (paperSource === 'VENDOR') return 'VENDOR';
  if (paperSource === 'CUSTOMER') return 'CUSTOMER';
  return 'BRADFORD';
}

/**
 * Resolve payment route from paperSource.
 * Default BRADFORD when missing (legacy partner jobs).
 */
export function getPaymentRoute(paperSource: PaperSourceKey): PaymentRoute {
  const src = normalizePaperSource(paperSource);

  if (src === 'BRADFORD') {
    return {
      paperSource: src,
      productionPayee: 'BRADFORD',
      bradfordGetsMarginShare: true, // included in Impact→Bradford outlay
      trackBradfordPaysJd: true,
      sendJdInvoiceToBradford: true,
      labels: {
        productionStage: 'Impact → Bradford',
        secondaryStage: 'Bradford → JD (mfg)',
      },
    };
  }

  // VENDOR (JD paper) or CUSTOMER paper → Impact pays JD for production
  return {
    paperSource: src,
    productionPayee: 'JD',
    bradfordGetsMarginShare: true,
    trackBradfordPaysJd: false,
    sendJdInvoiceToBradford: false,
    labels: {
      productionStage: 'Impact → JD',
      secondaryStage: 'Impact → Bradford (margin)',
    },
  };
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * Amounts Impact / Bradford pay under the paper-driven routes.
 *
 * Bradford paper:
 *   impactToBradford = sell − Impact share (full customer cash except Impact margin)
 *   bradfordToJdMfg  = manufacturing only
 *
 * JD paper:
 *   impactToJd       = total production cost (what JD is owed)
 *   impactToBradford = Bradford margin share only (no paper markup)
 */
export function getPaymentAmounts(paperSource: PaperSourceKey, profit: ProfitLike): PaymentAmounts {
  const route = getPaymentRoute(paperSource);
  const sell = Number(profit.sellPrice) || 0;
  const impactShare = Number(profit.impactTotal) || 0;
  const bradfordShare = Number(profit.bradfordTotal) || 0;
  const totalCost = Number(profit.totalCost) || 0;
  const mfg = Number(profit.bradfordOwesJD) || 0;

  if (route.productionPayee === 'BRADFORD') {
    // Impact cuts one check to Bradford covering paper + markup + mfg + Bradford margin.
    // Prefer sell − impact share so math always reconciles with calculator verification.
    let impactToBradford = sell > 0 && impactShare >= 0 ? sell - impactShare : bradfordShare + mfg + (Number(profit.paperCost) || 0);
    if (impactToBradford < 0) impactToBradford = 0;

    return {
      impactToBradford: round2(impactToBradford),
      impactToJd: 0,
      bradfordToJdMfg: round2(mfg),
      route,
    };
  }

  // JD paper: Impact pays JD production cost; Bradford gets margin-only share
  return {
    impactToBradford: round2(bradfordShare),
    impactToJd: round2(totalCost > 0 ? totalCost : mfg),
    bradfordToJdMfg: 0,
    route,
  };
}

/** Job is fully paid from Impact's cash view (route-aware). */
export function isImpactPaymentComplete(job: {
  paperSource?: PaperSourceKey;
  customerPaymentDate?: Date | string | null;
  bradfordPaymentPaid?: boolean | null;
  bradfordPaymentDate?: Date | string | null;
  jdPaymentPaid?: boolean | null;
  jdPaymentDate?: Date | string | null;
}): boolean {
  const route = getPaymentRoute(job.paperSource);
  const customer = !!(job.customerPaymentDate);
  const bradford = !!(job.bradfordPaymentPaid || job.bradfordPaymentDate);
  const jd = !!(job.jdPaymentPaid || job.jdPaymentDate);

  if (!customer) return false;

  if (route.productionPayee === 'BRADFORD') {
    // Impact done when Bradford paid. Bradford→JD is partner-side tracking.
    return bradford;
  }

  // JD paper: Impact must pay JD (production) + Bradford (margin)
  return jd && bradford;
}

/** Partner-complete includes Bradford→JD mfg mark on Bradford-paper jobs. */
export function isPartnerPaymentComplete(job: {
  paperSource?: PaperSourceKey;
  customerPaymentDate?: Date | string | null;
  bradfordPaymentPaid?: boolean | null;
  bradfordPaymentDate?: Date | string | null;
  jdPaymentPaid?: boolean | null;
  jdPaymentDate?: Date | string | null;
}): boolean {
  const route = getPaymentRoute(job.paperSource);
  const customer = !!(job.customerPaymentDate);
  const bradford = !!(job.bradfordPaymentPaid || job.bradfordPaymentDate);
  const jd = !!(job.jdPaymentPaid || job.jdPaymentDate);

  if (!customer) return false;

  if (route.productionPayee === 'BRADFORD') {
    return bradford && jd;
  }
  return jd && bradford;
}
