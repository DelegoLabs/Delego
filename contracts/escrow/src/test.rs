#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};
    use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus};

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

    #[test]
    fn test_get_escrow_summary_not_found() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &0u32, &treasury, &100i128, &10000i128);

        let result = client.try_get_escrow_summary(&99u64);
        assert_eq!(result, Err(Ok(EscrowError::NotFound)));
    }

    #[test]
    fn test_get_escrow_summary_existing() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin.clone());
        soroban_sdk::token::StellarAssetClient::new(&env, &token_id).mint(&buyer, &10000);

        client.initialize(&admin, &0u32, &treasury, &100i128, &10000i128);

        let amount = 500i128;
        let order_id = BytesN::from_array(&env, &[1u8; 32]);
        let escrow_id = client.deposit(&buyer, &seller, &token_id, &amount, &order_id, &100u32);

        let summary = client.get_escrow_summary(&escrow_id);
        assert_eq!(summary.escrow_id, escrow_id);
        assert_eq!(summary.buyer, buyer);
        assert_eq!(summary.seller, seller);
        assert_eq!(summary.amount, amount);
        assert_eq!(summary.status, EscrowStatus::Funded);
    }
}
