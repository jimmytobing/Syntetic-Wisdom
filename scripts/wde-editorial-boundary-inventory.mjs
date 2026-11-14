// Issue #35 - immutable read-only inventory from Salesforce snapshot evidence.
// Source: https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6868134576
// These are persisted boundaries, not independently adjudicated editorial gold.
export const boundaryInventorySource = Object.freeze({
  orgId:'00Dfj00000eVCOVEA4',
  sourceId:'a07fj00001F216TAAR',
  captionCount:1921,
  evidenceCommentId:6868134576
});
const boundaries = [
  [14,'Other','Testimony'],[53,'Testimony','Testimony'],
  [98,'Testimony','Testimony'],[186,'Testimony','Worship'],
  [396,'Worship','Other'],[400,'Other','Worship'],
  [526,'Worship','Prayer'],[558,'Prayer','Other'],
  [566,'Other','Teaching'],[811,'Teaching','Testimony'],
  [891,'Testimony','Teaching'],[1048,'Teaching','Teaching'],
  [1195,'Teaching','Testimony'],[1253,'Testimony','Teaching'],
  [1430,'Teaching','Worship'],[1524,'Worship','Teaching'],
  [1559,'Teaching','Prayer'],[1620,'Prayer','Prayer'],
  [1665,'Prayer','Prayer'],[1672,'Prayer','Worship'],
  [1712,'Worship','Prayer'],[1722,'Prayer','Worship'],
  [1811,'Worship','Worship']
];
const priorityEndIndexes = new Set([186,396,400,1195,1253,1559,1712,1722]);
export const persistedEditorialBoundaries=Object.freeze(boundaries.map(([end,leftType,rightType],i)=>
  Object.freeze({id:'B'+String(i+1).padStart(2,'0'),leftEnd:end,rightStart:end+1,
    leftType,rightType,priority:priorityEndIndexes.has(end)?'HIGH':'ROUTINE',
    decision:'NOT_ADJUDICATED',goldVerified:false})));

export function inspectBoundaryReviewInventory(inventory=persistedEditorialBoundaries){
  const findings=[];
  if(!Array.isArray(inventory)||inventory.length!==23)
    findings.push('BOUNDARY_COUNT_INVALID');
  if(!Array.isArray(inventory)||inventory.some((b,i)=>!
     Number.isSafeInteger(b?.leftEnd)||b.leftEnd<0||
     b.rightStart!==b.leftEnd+1||b.rightStart>=1921||
     b.id!=='B'+String(i+1).padStart(2,'0')))
    findings.push('BOUNDARY_STRUCTURE_INVALID');
  if(Array.isArray(inventory) && inventory.some((b,i)=>i>0&&b.leftEnd<=inventory[i-1].leftEnd))
    findings.push('BOUNDARY_ORDER_INVALID');
  if(Array.isArray(inventory) && inventory.some(b=>b.decision!=='NOT_ADJUDICATED'||b.goldVerified!==false))
    findings.push('UNVERIFIED_GOLD_CLAIM');
  return {status:findings.length?'INVALID_INVENTORY':'READY_FOR_HUMAN_REVIEW',
    findings,reviewedCount:0,certifiedGoldCount:0,
    expectedBoundaries:23,autoApprovalAllowed:false};
}
