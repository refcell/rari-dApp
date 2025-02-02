import { useQuery } from "react-query";
import { useRari } from "context/RariContext";
import { useSaffronContracts } from "components/pages/Tranches/SaffronContext";

import { smallUsdFormatter, smallStringUsdFormatter } from "utils/bigUtils";
import ERC20ABI from "rari-sdk/abi/ERC20.json";

export enum TranchePool {
  DAI = "DAI",
  USDC = "USDC",
}

export enum TrancheRating {
  S = "S",
  AA = "AA",
  A = "A",
}

const ACTIVE_TRANCHES: { pool: TranchePool; ratings: TrancheRating[] }[] = [
  {
    pool: TranchePool.DAI,
    ratings: [TrancheRating.S, TrancheRating.A],
  },
];

export const tranchePoolIndex = (tranchePool: TranchePool) => {
  // TODO: CHANGE USDC TO WHATEVER IT BECOMES LATER
  return tranchePool === TranchePool.DAI ? 9 : 0;
};

export const trancheRatingIndex = (trancheRating: TrancheRating) => {
  return trancheRating === TrancheRating.S
    ? 0
    : trancheRating === TrancheRating.AA
    ? 1
    : 2;
};

export const useSaffronData = () => {
  const { data } = useQuery("saffronData", async () => {
    return (await fetch("https://api.spice.finance/apy")).json();
  });

  const contracts = useSaffronContracts();

  const fetchCurrentEpoch = async () => {
    const currentEpoch = await contracts.saffronPool.methods
      .get_current_epoch()
      .call();

    return currentEpoch;
  };

  return {
    saffronData: data as {
      SFI: { USD: number };
      pools: {
        name: string;
        tranches: { A: { "total-apy": number }; S: { "total-apy": number } };
      }[];
    },
    fetchCurrentEpoch,
    ...contracts,
  };
};

export const usePrincipal = (
  tranchePool: TranchePool,
  trancheRating: TrancheRating
) => {
  const { rari, address } = useRari();
  const { saffronPool, fetchCurrentEpoch } = useSaffronData();

  const { data: principal } = useQuery(
    tranchePool + trancheRating + " principal " + address,
    async () => {
      //TODO: ADD USDC POOL

      const currentEpoch = await fetchCurrentEpoch();

      const tranchePToken = new rari.web3.eth.Contract(
        ERC20ABI as any,
        await saffronPool.methods
          .principal_token_addresses(
            currentEpoch,
            trancheRatingIndex(trancheRating)
          )
          .call()
      );

      return smallUsdFormatter(
        parseInt(await tranchePToken.methods.balanceOf(address).call()) / 1e18
      ).replace("$", "");
    }
  );

  return principal;
};

export const usePrincipalBalance = () => {
  const { rari, address } = useRari();
  const { saffronPool, fetchCurrentEpoch } = useSaffronData();

  const { data: principal } = useQuery(
    "principalBalance " + address,
    async () => {
      const currentEpoch = await fetchCurrentEpoch();

      const sTranchePToken = new rari.web3.eth.Contract(
        ERC20ABI as any,
        await saffronPool.methods
          .principal_token_addresses(currentEpoch, 0)
          .call()
      );

      const aTranchePToken = new rari.web3.eth.Contract(
        ERC20ABI as any,
        await saffronPool.methods
          .principal_token_addresses(currentEpoch, 2)
          .call()
      );

      return smallStringUsdFormatter(
        rari.web3.utils.fromWei(
          rari.web3.utils
            .toBN(await sTranchePToken.methods.balanceOf(address).call())
            .add(
              rari.web3.utils.toBN(
                await aTranchePToken.methods.balanceOf(address).call()
              )
            )
        )
      );
    }
  );

  return principal;
};

export const useEpochEndDate = () => {
  const { saffronPool, fetchCurrentEpoch } = useSaffronData();

  return useQuery("epochEndDate", async () => {
    const currentEpoch = await fetchCurrentEpoch();

    const endDate = new Date(
      (await saffronPool.methods.get_epoch_end(currentEpoch).call()) * 1000
    );

    return { currentEpoch, endDate };
  });
};

export const useEstimatedSFI = () => {
  const { rari, address } = useRari();
  const { saffronPool, saffronStrategy, fetchCurrentEpoch } = useSaffronData();

  const { data: estimatedSFI } = useQuery(
    "estimatedSFI " + address,
    async () => {
      // TODO: ADD USDC

      const DAI_SFI_REWARDS =
        parseInt(
          await saffronStrategy.methods
            .pool_SFI_rewards(tranchePoolIndex(TranchePool.DAI))
            .call()
        ) / 1e18;

      const SFI_multipliers = await saffronPool.methods
        .TRANCHE_SFI_MULTIPLIER()
        .call();

      const currentEpoch = await fetchCurrentEpoch();

      const dsecSToken = new rari.web3.eth.Contract(
        ERC20ABI as any,
        await saffronPool.methods
          .principal_token_addresses(
            currentEpoch,
            trancheRatingIndex(TrancheRating.S)
          )
          .call()
      );

      // TODO ADD AA POOL

      const dsecSSupply = await dsecSToken.methods.totalSupply().call();

      const sPoolSFIEarned =
        DAI_SFI_REWARDS *
        (SFI_multipliers[trancheRatingIndex(TrancheRating.S)] / 100000) *
        // If supply is zero we will get NaN for dividing by zero
        (dsecSSupply === "0"
          ? 0
          : (await dsecSToken.methods.balanceOf(address).call()) / dsecSSupply);

      const dsecAToken = new rari.web3.eth.Contract(
        ERC20ABI as any,
        await saffronPool.methods
          .principal_token_addresses(
            currentEpoch,
            trancheRatingIndex(TrancheRating.A)
          )
          .call()
      );

      const dsecASupply = await dsecAToken.methods.totalSupply().call();

      const aPoolSFIEarned =
        DAI_SFI_REWARDS *
        (SFI_multipliers[trancheRatingIndex(TrancheRating.A)] / 100000) *
        // If supply is zero we will get NaN for dividing by zero
        (dsecASupply === "0"
          ? 0
          : (await dsecAToken.methods.balanceOf(address).call()) / dsecASupply);

      const formatSFI = (num) =>
        smallUsdFormatter(num).replace("$", "") + " SFI";

      return {
        aPoolSFIEarned,
        sPoolSFIEarned,
        totalSFIEarned: aPoolSFIEarned + sPoolSFIEarned,
        formattedAPoolSFIEarned: formatSFI(aPoolSFIEarned),
        formattedSPoolSFIEarned: formatSFI(sPoolSFIEarned),
        formattedTotalSFIEarned: formatSFI(aPoolSFIEarned + sPoolSFIEarned),
      };
    }
  );

  return estimatedSFI;
};

export const useMySaffronData = () => {
  const { saffronData } = useSaffronData();

  const currentPools = saffronData?.pools;

  // Filter out the API data by the tranches and ratings Rari supports
  const supportedPools = currentPools
    ? ACTIVE_TRANCHES.map((t) => {
        const currentPool = currentPools[tranchePoolIndex(t.pool)];
        const availableTranches: string[] = Object.keys(currentPool.tranches);
        //@ts-ignore
        const supportedTranches = availableTranches.filter((item) =>
          t.ratings.includes(TrancheRating[item])
        );

        const tranches = {};
        supportedTranches.forEach((key) => {
          //@ts-ignore
          tranches[key] = currentPool.tranches[key];
        });

        const finalPool = {
          ...currentPool,
          tranches,
        };
        return finalPool;
      })
    : [];

  return supportedPools;
};
