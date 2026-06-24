#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let fee_bps = 250u32;
        let min_amount = 100i128;
        let max_amount = 10000i128;
        
        let res = client.initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);
        assert!(res);

        let res_try = client.try_initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);
        assert_eq!(res_try, Err(Ok(EscrowError::AlreadyInitialized)));
    }
}
