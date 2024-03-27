package main_test

import (
	"io"
	"net/http"

	. "github.com/onsi/ginkgo/v2"
)

func IsHealthy() bool {
	resp, err := http.Get(serverURL + "/health")

	if err != nil {
		return false
	}

	return resp.StatusCode == http.StatusOK
}

func GetPage(path string) (error, int, string) {
	By("Making request to " + serverURL + path)
	resp, err := http.Get(serverURL + path)

	if err != nil {
		return err, 0, ""
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err, 0, ""
	}
	resp.Body.Close()

	By("Received response from " + serverURL + path + " of " + resp.Status)
	return nil, resp.StatusCode, string(body)
}

const (
	top5PetitionsResponse = `{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "action": "Cancel GCSEs and A Levels in 2021",
          "id": "326066"
        },
        "value": [
          1602615858.675,
          "60073.71785962473"
        ]
      },
      {
        "metric": {
          "action": "Prevent gyms closing due to a spike in Covid 19 cases",
          "id": "333869"
        },
        "value": [
          1602615858.675,
          "58493.62056984016"
        ]
      },
      {
        "metric": {
          "action": "Lower university tuition fees for students until online teaching ends",
          "id": "552911"
        },
        "value": [
          1602615858.675,
          "29253.314801945795"
        ]
      },
      {
        "metric": {
          "action": "Ban the shooting of badgers immediately",
          "id": "333693"
        },
        "value": [
          1602615858.675,
          "3940.736622654621"
        ]
      },
      {
        "metric": {
          "action": "Protect the UK's dwindling hedgehog population before it's too late.",
          "id": "550379"
        },
        "value": [
          1602615858.675,
          "3064.1278665740097"
        ]
      }
    ]
  }
}`
	top5PetitionsSeriesResponse = `{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [
      {
        "metric": {
          "action": "Ban the shooting of badgers immediately",
          "id": "333693"
        },
        "values": [
          [
            1602011256.246,
            "156.61016949152543"
          ],
          [
            1602012456.246,
            "165.76271186440678"
          ],
          [
            1602013656.246,
            "157.6271186440678"
          ]
        ]
      },
      {
        "metric": {
          "action": "Cancel GCSEs and A Levels in 2021",
          "id": "326066"
        },
        "values": [
          [
            1602011256.246,
            "371.18644067796606"
          ],
          [
            1602012456.246,
            "356.9491525423729"
          ],
          [
            1602013656.246,
            "338.64406779661016"
          ]
        ]
      },
      {
        "metric": {
          "action": "Lower university tuition fees for students until online teaching ends",
          "id": "552911"
        },
        "values": [
          [
            1602011256.246,
            "103.72881355932203"
          ],
          [
            1602012456.246,
            "110.84745762711864"
          ],
          [
            1602013656.246,
            "106.77966101694915"
          ]
        ]
      },
      {
        "metric": {
          "action": "Prevent gyms closing due to a spike in Covid 19 cases",
          "id": "333869"
        },
        "values": [
          [
            1602011256.246,
            "0"
          ],
          [
            1602012456.246,
            "0"
          ],
          [
            1602013656.246,
            "0"
          ]
        ]
      },
      {
        "metric": {
          "action": "Protect the UK's dwindling hedgehog population before it's too late.",
          "id": "550379"
        },
        "values": [
          [
            1602011256.246,
            "83.38983050847457"
          ],
          [
            1602012456.246,
            "84.40677966101694"
          ],
          [
            1602013656.246,
            "83.38983050847457"
          ]
        ]
      }
    ]
  }
}`
)
