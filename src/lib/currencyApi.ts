import { CURRENCY as PrismaCurrency } from '@prisma/client';
import fetch from 'node-fetch';
import config from '../config';

// type ConvertCurrencyResponse = {
//   meta: {
//     last_updated_at: string;
//   };
//   data: {
//     [Key in PrismaCurrency]: {
//       code: Key;
//       value: number;
//     };
//   };
// };

type ConvertCurrencyResponse = {
  meta: {
    last_updated_at: string;
  };
  data: {
    USD: {
      code: 'USD';
      value: number;
    };
  };
};

export const convertToUSD = async (
  baseCurrency: PrismaCurrency,
  amount: number,
): Promise<ConvertCurrencyResponse | null> => {
  const positiveAmount = amount < 0 ? amount * -1 : amount;

  const BASE_URI = `https://api.currencyapi.com/v3/convert?apikey=${config.secrets.currencyApiKey}&currencies=USD&base_currency=${baseCurrency}&value=${positiveAmount}`;

  try {
    const response = await fetch(BASE_URI);
    const data = (await response.json()) as ConvertCurrencyResponse;

    if (amount < 0) {
      data.data.USD.value = data.data.USD.value * -1;
    }
    return data;
  } catch (error) {
    console.log(error);
    return null;
  }
};
