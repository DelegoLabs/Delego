#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::{EscrowContract, EscrowContractClient};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        assert!(client.initialize(&admin));
    }
}
