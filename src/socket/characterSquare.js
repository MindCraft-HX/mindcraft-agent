import { useMitt } from "@/utils/mitt";
const mitt = useMitt();

const characterSquare = [
  {
    socketName: 'createCharacter',
    processor: (data) => {
      const { socket_message, socket_id, socket_data = { agent_output: null } } = data
      if(socket_data.agent_output) {
        mitt.emit('createCharacter', socket_data.agent_output)
      }
      if(socket_message == "agent_stop") {
        mitt.emit('finishReplyCharacter')
      }
      if(socket_data.text) {
        mitt.emit('createCharacterInput', socket_data)
      }
    },
    formatData: (data) => {
      return {
        socket_type: "agent_event",
        event_name: "agent_action",
        socket_id: data.socket_id,
        event_params: {
          agent_name: "create_character_profile",
          asr_text: data.asr_text,
          character_profile: data.character_profile
        }
      }
    }
  },
  {
    socketName: 'createUserCharacter',
    processor: (data) => {
      const { socket_message, socket_id, socket_data = { agent_output: null } } = data
      if(socket_data.agent_output) {
        mitt.emit('createUserCharacter', socket_data.agent_output)
      }
      if(socket_message == "agent_stop") {
        mitt.emit('finishReplyCharacter')
      }
      if(socket_data.text) {
        mitt.emit('createUserCharacterInput', socket_data)
      }
    },
    formatData: (data) => {
      return {
        socket_type: "agent_event",
        event_name: "agent_action",
        socket_id: data.socket_id,
        event_params: {
          agent_name: "create_character_profile",
          asr_text: data.asr_text,
          character_profile: data.character_profile
        }
      }
    }
  },
  {
    socketName: 'createCharacterByVoice',
    processor: (data) => {
      
    },
    formatData: (data) => {
      return {
        sendOriginalData: true,
        DATA: data.file
      }
    }
  },
  {
    socketName: 'createCharacterByVoiceStop',
    processor: (data) => {
      
    },
    formatData: (data) => {
      return {
        socket_id: data.socket_id,
        socket_type: "intervent_event",
        event_name: "stream_asr"
      }
    }
  }
]

export {
  characterSquare
};