```json
Dialog {
    id: string
    omni_user_id: string
    ext_id: string
    topic_id: string
    topic_title: string
    topic_level1_id: string
    topic_level1_title: string
    topic_level2_id: string
    topic_level2_title: string
    topic_level3_id: string
    topic_level3_title: string
    topic_program_id: string
    topic_program_title: string
    topic_sub_product_id: string
    topic_sub_product_title: string
    topic_product_id: string
    topic_product_title: string
    default_agent: string
    fname: string
    mname: string
    lname: string
    description: string
    customer_id: string
    user_pic: string
    
    score?: number
    auditor_score?: number
    new_msg_cnt: number
    status: string
    context: DialogContext

    cur_session: LiveSession
    session_hist: LiveSession[]
    
    connected_supervisor_ids: string[]

    stat: Stat
    routing: Routing
    slot_context?: DialogSlotContext

    is_handled_by_bot: boolean

    userDissatisfaction: string

    dialogTopics?: DialogTopics
}

DialogContext = string[][]

type LiveSession = {
    id: string
    dialog_id: string
    omni_user_id: string
    customer_id: string
    channel_id: string
    session_id: string
    agent_id: string
    cust_agent_id: string
    operator_id: string
    operator_fname: string
    operator_lname: string
    callcenter: string
    queue_id?: string
    stat: Stat
    routing: DialogRouting
}

Stat = {
    stat_type: StatType
    processed_by: ProcessedBy
    was_dialog_lost: boolean
    was_dialog_abandoned: boolean
    customer_id: string
    dialog_id: string
    dialog_status: string
    dialog_channel_type: string
    dialog_topic: string

    topic_level1_title: string
    topic_level2_title: string
    topic_level3_title: string
    topic_program_title: string
    topic_product_title: string
    user_dissatisfaction: string

    operator_id: string
    operator_name: string
    operator_position?: string
    session_id: string
    queue_id?: string
    forwarded_from_operator: boolean

    initiated: number
    started: number
    dispatched: number
    first_reply: number
    last_outgoing_message_sent: number
    finished: number
    routed: number
    enqueued_in_routing_queue: number
    negative_reason: string
    finish_reason: string

    dispatch_time_msec: number
    first_response_time_msec: number
    first_wait_time_msec: number
    max_response_time_msec: number
    avg_response_time_msec: number
    duration_msec: number
    workload_time_msec: number

    op_msgs_cnt: number
    op_responses_cnt: number
    client_msgs_cnt: number
    op_avg_answer_length: number

    forwarded_from: string
    forwarded_to: string

    speller_score: number
    client_score: number

    routing_group: string

    was_useful?: boolean

    appeal_type: AppealType

    voice_recognition_time?: number

    hold_time_msec: number
    handling_time_msec: number

    avg_client_response_time_to_bot?: number

    avg_client_response_time_to_operator?: number

    slots: Object // {key: value}

    hold_with_replies_msec?: number

    dialogTopicTitles?: DialogTopicTitles
    
    operator_first_open_time?: number
}

StatType =
    | DialogStat
    | OperatorStat 
    | BotStat  
    | SessionStat  
    
ProcessedBy =
    | Human
    | Bot
    | Both
    | NotEffective
    | NotNeeded
    
AppealType =
    | Text
    | Voice

DialogRouting {
    callcenter: string
    lang: string
    skill: string
    group: string
    operator_id: string
    force: boolean
}

DialogSlotContext {
    current_intent_id : string
    current_slot_id : string
    filled_slots : DialogFilledSlot[]
    conflicts : ConflictedSlot[]
    attempts_to_fill : AttemptsToFill[]
    started_at_ms: number
}

DialogFilledSlot {
    intent_id: string
    slot_id: string
    filled_at_ms: number
    filled_by: string
    scrubbingStatus: string
    value: string
}

SlotFilledBy =
    | User
    | Auto

ScrubbingStatus =
    | NotScrubbed
    | Scrubbed
    
ConflictedSlot = {
    slot_id : string
    current_value : string
    conflict_value : string
    being_processed : boolean
    scrubbingStatus: ScrubbingStatus
}

AttemptsToFill = {
    slot_id : string
    number_of_attempts :number
    buffer?: string
}

DialogTopics = {
    dialogTopicIds1: string[]
    dialogTopicTitle1: string
    dialogTopicIds2: string[]
    dialogTopicTitle2: string
    dialogTopicIds3: string[]
    dialogTopicTitle3: string
    dialogTopicIds4: string[]
    dialogTopicTitle4: string
    dialogTopicIds5: string[]
    dialogTopicTitle5: string
}

ReplyMessage {
    id: string
    timestamp: number
    orig_msg_id: string
    omni_user_id: string
    merged_to?: string
    ext_user_id: string
    session_id: string
    customer_id: string
    operator: MessageOperator
    message: ReplyMessageContent
    routing: Routing
    context: string[][]
    channel_id: string
    intent_qa_id: string
    slot_context?: SlotContext
    message_type: number
    reply_to_message?: HistoryRecord
    parent_message_id?: string
    agent_id: string
}

MessageOperator {
    operator_id: string
    operator_fname: string
    operator_lname: string
    dialog_id?: string
}

ReplyMessageContent {
    text_type: "Text" | "Html" | "Markdown"
    text: string
    attachment?: Attachment
    attachments?: Attachment[]
    actions?: Action[]
    request?: string[][]
    sticker?: Sticker
}

Attachment {
    attachment_type: string
    attachment_url: string
    attachment_name: string
}

Action {
    action_id: string
    action_text: string
}

Sticker {
    sticker_id: string
    sticker_url: string
    animation_type: string
}

Routing {
    callcenter: string
    lang: string
    skill: string
    group: string
    operator_id: string
    force: boolean
}

SlotContext {
    filled_slots: FilledSlot[]
}

FilledSlot {
    slot_id: string
    value: string
    filled_at_ms: number
}

HistoryRecord {
    is_reply: boolean
    message: IncomingMessage
    reply: ReplyMessage
}

// ── User ────────────────────────────────────────────────────────────────────
// Sub-object of IncomingMessage. Core fields present in all agents:

User {
    omni_user_id: string        // Platform user identifier — used as storage keys and query terms
    customer_id: string         // Project / tenant ID — used as ProjectId in SendMessageParams.
                                // Fallback pattern: message.user.customer_id || message.channel.customer_id
    session_id: string          // Current dialog session ID — used as a dialog ID proxy
    channel_user_id: string     // User's ID in the external channel (phone number in telephony channels)
    ext_id?: string             // External user ID — written by auth agents
    slot_context?: SlotContext  // Per-user slot context (same shape as message.slot_context)
    uuid?: string               // Used for push notification targeting
    user_id?: number            // Raw platform user ID
    locale?: string             // e.g. "ru-RU"
    timezone?: number
    user_type?: string
    birthdate?: string
    changed_at?: number
}

// ── Channel ─────────────────────────────────────────────────────────────────

Channel {
    channel_id: string          // Channel identifier
    customer_id: string         // Project / tenant ID (same as User.customer_id, use as fallback)
    channel_type?: string       // e.g. "webchat", "telegram", "vk"
    id_in_channel?: string
    channel_features?: string[] // e.g. ["TEXT"]
}

// ── IncomingMessage ──────────────────────────────────────────────────────────

IncomingMessage {
    id: string
    id_from_channel: string
    parent_message_id: string
    message_type: number
    reply_to_message?: HistoryRecord
    timestamps: Timestamps
    channel: Channel
    user: User
    message: IncomingMessageContent
    agent_params: Pair[]
    agent_id: string
    agent_cust_id: string
    slot_context?: SlotContext
    context: string[][]
    meta: Record<string, string>
    routing: Routing
}

Timestamps {
    sent_from_channel: number
    received_from_channel: number
    dispatched: number
}

IncomingMessageContent {
    text: string
    attachment?: Attachment
    attachments?: Attachment[]
    action?: string
    action_title?: string
    sticker?: Sticker
}

Pair {
    n: string
    v: string
}

SendMessageRequest {
    MessageMarkdown: string
    SendMessageParams: SendMessageParams
}

SendMessageParams {
    ProjectId: string
    OmniUserId?: string
    DestinationChannel?: ChannelInfo
    Sender: MessageOperator
    FilledSlots?: Record<string, string>  // Plain key-value object e.g. { flag: "true", count: "3" }
}

ChannelInfo {
    ChannelId: string
    ChannelUserId: string
}

SendMessageResponse {
    Ok: boolean
    Errors: string[]
}

FinishDialogResponse {
    Response: string
}

GetDialogIdResponse {
    Response: string
}

GetDialogResponse {
    Response: Dialog
}

StorageSearchResult {
    data: Object                    // The value passed to storage.set()
    keyword_fields: Pair[]          // { key: string, value: string }[]
    text_fields: Pair[]
    timestamp_fields: { key: string, value: number }[]
    number_fields: { key: string, value: number }[]
}
```
