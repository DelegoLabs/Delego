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
        
        let res = client.initialize(&admin);
        assert!(res);

        let res_try = client.try_initialize(&admin);
        assert_eq!(res_try, Err(Ok(EscrowError::AlreadyInitialized)));
    }
}
