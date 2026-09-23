

<style>
.markdown-body table {min-width: 100%;width: 100%;display: table;}
thead {min-width: 100%;width: 100%;}
th {min-width: 60%;width: 60%;}
th:last-child {min-width: 20%;width: 20%;}
th:first-child {min-width: 20%;width: 20%;}
</style>



# Scout Report - CrimsonSentry - 2026-09-23

## Summary

| <span style="color:green">Crate</span> | <span style="color:green">Status</span> | <span style="color:green">Critical</span> | <span style="color:green">Medium</span> | <span style="color:green">Minor</span> | <span style="color:green">Enhancement</span> | 
| - | - | - | - | - | - | 
| policy_vault | Analyzed | 0 | 1 | 0 | 5 | 


Issues found:



- [Dynamic Storage](#dynamic-storage) (1 results) (Medium)

- [Storage Change Events](#storage-change-events) (5 results) (Enhancement)



## Resource Management



### Dynamic Storage

**Impact:** Medium

**Issue:** Using dynamic types in instance or persistent storage can lead to unnecessary growth or storage-related vulnerabilities.

**Description:** Using dynamic types in instance or persistent storage can lead to unnecessary growth or storage-related vulnerabilities.

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/dynamic-storage)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 0 | contracts | [lib.rs:207:9 - 207:65](contracts/policy-vault/src/lib.rs) |



## Best Practices



### Storage Change Events

**Impact:** Enhancement

**Issue:** Consider emiting an event when storage is modified

**Description:** Emiting an event when storage changes is a good practice to make the contracts more transparent and usable to its clients and observers

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/storage-change-events)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 1 | contracts | [lib.rs:241:5 - 241:27](contracts/policy-vault/src/lib.rs) |
| 2 | contracts | [lib.rs:164:5 - 164:56](contracts/policy-vault/src/lib.rs) |
| 3 | contracts | [lib.rs:251:5 - 251:51](contracts/policy-vault/src/lib.rs) |
| 4 | contracts | [lib.rs:231:5 - 231:48](contracts/policy-vault/src/lib.rs) |
| 5 | contracts | [lib.rs:245:5 - 245:29](contracts/policy-vault/src/lib.rs) |


