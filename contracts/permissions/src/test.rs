#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
    use crate::{PermissionsContract, PermissionsContractClient};

    #[test]
    fn test_grant() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let mut merchants = Vec::new(&env);
        merchants.push_back(merchant.clone());

        assert!(client.grant(&owner, &delegate, &100, &1000, &10000, &merchants));
        assert!(client.can_spend(&owner, &delegate, &50, &merchant));
    }
}
