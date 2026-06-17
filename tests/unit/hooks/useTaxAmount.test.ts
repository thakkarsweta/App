import {renderHook} from '@testing-library/react-native';
import useTaxAmount from '@components/MoneyRequestConfirmationList/hooks/useTaxAmount';
import type * as OnyxTypes from '@src/types/onyx';

jest.mock('@hooks/useCurrencyList', () => ({
    useCurrencyListActions: () => ({getCurrencyDecimals: () => 2}),
}));

jest.mock('@libs/CurrencyUtils', () => ({
    convertToBackendAmount: (n: number) => Math.round(n * 100),
}));

jest.mock('@libs/DistanceRequestUtils', () => ({
    __esModule: true,
    default: {
        getTaxableAmount: () => 100,
    },
}));

const mockGetDefaultTaxCode = jest.fn(() => 'tax_default');
const mockHasTaxRateWithMatchingValue = jest.fn(() => false);

jest.mock('@libs/TransactionUtils', () => ({
    calculateTaxAmount: (taxPercentage: string, taxableAmount: number) => {
        const pct = Number.parseFloat(String(taxPercentage).replace('%', '')) || 0;
        return (taxableAmount * pct) / 100;
    },
    getDefaultTaxCode: (...args: unknown[]) => mockGetDefaultTaxCode(...args),
    getTaxValue: () => '10%',
    hasTaxRateWithMatchingValue: (...args: unknown[]) => mockHasTaxRateWithMatchingValue(...args),
}));

type Params = Parameters<typeof useTaxAmount>[0];

const baseParams: Params = {
    transaction: {transactionID: 'txn1', amount: 1000, currency: 'USD'} as unknown as OnyxTypes.Transaction,
    policy: undefined,
    policyForMovingExpenses: undefined,
    isDistanceRequest: false,
    isMovingTransactionFromTrackExpense: false,
    customUnitRateID: '',
    distance: 0,
    previousTransactionCurrency: 'USD',
};

describe('useTaxAmount', () => {
    beforeEach(() => {
        mockGetDefaultTaxCode.mockReset();
        mockGetDefaultTaxCode.mockReturnValue('tax_default');
        mockHasTaxRateWithMatchingValue.mockReset();
        mockHasTaxRateWithMatchingValue.mockReturnValue(false);
    });

    it('returns the default tax code and value from policy resolution', () => {
        const {result} = renderHook(() => useTaxAmount(baseParams));
        expect(result.current.defaultTaxCode).toBe('tax_default');
        expect(result.current.defaultTaxValue).toBe('10%');
    });

    it('computes taxAmountInSmallestCurrencyUnits from amount * tax rate', () => {
        // amount = 1000 (in smallest units = $10.00 since |amount|=1000 → 10% of 1000 = 100; convertToBackendAmount(100) = 10000)
        const {result} = renderHook(() => useTaxAmount(baseParams));
        expect(result.current.taxAmountInSmallestCurrencyUnits).toBe(10000);
    });

    it('uses distance taxable amount for distance requests', () => {
        const {result} = renderHook(() => useTaxAmount({...baseParams, isDistanceRequest: true}));
        // taxableAmount=100 from mocked getTaxableAmount, 10% = 10, convertToBackendAmount(10) = 1000
        expect(result.current.taxAmountInSmallestCurrencyUnits).toBe(1000);
    });

    it('shouldKeepCurrentTaxSelection is false when policy has no matching tax rate', () => {
        const {result} = renderHook(() => useTaxAmount(baseParams));
        expect(result.current.shouldKeepCurrentTaxSelection).toBe(false);
    });

    it('shouldKeepCurrentTaxSelection is false when tax code is a stale automatic default for the new currency', () => {
        mockGetDefaultTaxCode.mockImplementation((_policy, transaction: {currency?: string}, currency?: string) => {
            const effectiveCurrency = currency ?? transaction?.currency;
            return effectiveCurrency === 'EUR' ? 'tax_foreign' : 'tax_default';
        });
        mockHasTaxRateWithMatchingValue.mockReturnValue(true);

        const policy = {
            taxRates: {
                defaultExternalID: 'tax_default',
                foreignTaxDefault: 'tax_foreign',
            },
        } as unknown as OnyxTypes.Policy;

        const {result} = renderHook(() =>
            useTaxAmount({
                ...baseParams,
                transaction: {transactionID: 'txn1', amount: 1000, currency: 'EUR', taxCode: 'tax_default'} as unknown as OnyxTypes.Transaction,
                policy,
                previousTransactionCurrency: undefined,
            }),
        );

        expect(result.current.shouldKeepCurrentTaxSelection).toBe(false);
    });
});
