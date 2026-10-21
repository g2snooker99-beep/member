"use strict";
function requireMutationGate(value){if(value!=="true")throw Object.assign(Error("Member writes disabled for release hold"),{code:"failed-precondition"});}
module.exports={requireMutationGate};
